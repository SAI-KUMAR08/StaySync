import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import { emitTenantAssigned, emitTenantRemoved } from "../../utils/socketEvents.js";
import {
  Room,
  Bed,
  Tenant,
  Payment,
  Owner,
  RoomAssignmentHistory,
  VacateRequest,
} from "../../models/index.js";
import { ownerFilter } from "../../utils/scope.js";
import * as occupancyService from "../../services/occupancyService.js";
import * as tempAllotmentService from "../../services/tempAllotmentService.js";
import * as vacateService from "../../services/vacateService.js";
import { logActivity } from "../../services/activityService.js";
import { normalizePhone } from "../../utils/phone.js";
import { getMissingProfileFields } from "../../utils/profileCompleteness.js";
import { escapeRegex } from "../../utils/regex.js";
import { getEnglishMonthName } from "../../utils/date.js";
import { TENANT as TENANT_POLICY } from "../../utils/constants.js";

export const listTenants = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const query = { ...f };
  const { search, status } = req.query;

  if (status === "active") query.isActive = true;
  if (status === "inactive") query.isActive = false;
  if (status === "temporary") query.isTemporary = true;

  if (search?.trim()) {
    const term = escapeRegex(search.trim());
    const phoneDigits = normalizePhone(term);
    query.$or = [
      { "personalInfo.name": { $regex: term, $options: "i" } },
      ...(phoneDigits ? [{ "personalInfo.phone": { $regex: phoneDigits } }] : []),
    ];
  }

  const tenants = await Tenant.find(query)
    .populate("hostelId", "name")
    .populate("floorId", "floorName floorNumber")
    .populate("roomId", "roomNumber floor")
    .populate("bedId", "bedNumber occupancyStatus")
    .sort({ createdAt: -1 });

  // Attach each tenant's active vacate request so the frontend can gate the
  // Vacate action on the approved vacating date without extra round-trips.
  // Serialize through toObject() because mongoose toJSON() drops custom props.
  const byTenant = await buildVacateMap(tenants, f);
  const result = tenants.map((t) => {
    const plain = t.toObject();
    const r = byTenant.get(String(t._id));
    if (r) {
      plain.vacateRequest = {
        status: r.status,
        requestedVacateDate: r.requestedVacateDate,
        approvedVacateDate: r.approvedVacateDate || r.requestedVacateDate,
      };
    }
    return plain;
  });

  return success(res, result);
});

/** Map tenantId → active vacate request (pending/approved/completed), latest wins. */
async function buildVacateMap(tenants, f) {
  const ids = tenants.map((t) => t._id);
  if (ids.length === 0) return new Map();

  const requests = await VacateRequest.find({
    ...f,
    tenantId: { $in: ids },
    status: { $in: ["pending", "approved", "completed"] },
    isActive: true,
  })
    .select("tenantId status requestedVacateDate approvedVacateDate")
    .sort({ createdAt: 1 }) // oldest first, so the latest request wins below
    .lean();

  const byTenant = new Map();
  for (const r of requests) byTenant.set(String(r.tenantId), r);
  return byTenant;
}

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...ownerFilter(req) })
    .populate("hostelId", "name")
    .populate("floorId", "floorName floorNumber")
    .populate("roomId", "roomNumber floor")
    .populate("bedId", "bedNumber occupancyStatus");
  if (!tenant) throw new AppError("Tenant not found", 404);

  const f = ownerFilter(req);
  const plain = tenant.toObject();
  const reqDoc = await VacateRequest.findOne({
    ...f,
    tenantId: tenant._id,
    status: { $in: ["pending", "approved", "completed"] },
    isActive: true,
  }).sort({ createdAt: -1 });
  if (reqDoc) {
    plain.vacateRequest = {
      status: reqDoc.status,
      requestedVacateDate: reqDoc.requestedVacateDate,
      approvedVacateDate: reqDoc.approvedVacateDate || reqDoc.requestedVacateDate,
    };
  }
  return success(res, plain);
});

export const createTenant = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const {
    name,
    email,
    phone,
    aadhaarNumber,
    address,
    emergencyContact,
    sharingType,
    monthlyRent,
    joinDate,
    idProof,
    isSecurityDepositPaid,
    isTemporary,
    preferredSharing,
  } = req.validated.body;

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10) {
    throw new AppError("Enter a valid 10-digit mobile number", 400);
  }

  // Mobile number must be globally unique — checked FIRST so a duplicate phone
  // surfaces the inline phone field error even when a generated placeholder email
  // would otherwise collide first.
  const existsPhone = await Tenant.findOne({ "personalInfo.phone": normalizedPhone });
  if (existsPhone) {
    throw new AppError("A tenant with this mobile number already exists.", 409, {
      fieldErrors: { phone: ["A tenant with this mobile number already exists."] },
    });
  }

  const normalizedEmail = email
    ? email.trim().toLowerCase()
    : `tenant-${normalizedPhone}@placeholder.local`;

  if (normalizedEmail) {
    const ownerClash = await Owner.findOne({ email: normalizedEmail });
    if (ownerClash) throw new AppError("Email is already used by a hostel owner", 409);

    const existsEmail = await Tenant.findOne({
      "personalInfo.email": normalizedEmail,
      ownerId: f.ownerId,
      hostelId: f.hostelId,
    });
    if (existsEmail) throw new AppError("Tenant email already exists in this hostel", 409);
  }

  const sharing = Number(sharingType);
  if (!Number.isFinite(sharing) || sharing < 1) {
    throw new AppError("Select a valid room type", 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const depositAmount = TENANT_POLICY.SECURITY_DEPOSIT_AMOUNT;
    const depositDate = isSecurityDepositPaid ? new Date() : null;

    const [created] = await Tenant.create(
      [
        {
          ...f,
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          aadhaarNumber,
          address: address?.trim(),
          emergencyContact,
          // NOTE: floorId/roomId/bedId are intentionally NOT pre-set here —
          // assignTenantToBed populates them, so the first history entry is a
          // `check_in` rather than a `bed_shift`.
          idProof: idProof || undefined,
          monthlyRent: monthlyRent ?? 0,
          joinDate: joinDate ?? new Date(),
          isTemporary: isTemporary ?? false,
          ...(isTemporary && preferredSharing ? { preferredSharing } : {}),
          isSecurityDepositPaid: isSecurityDepositPaid ?? false,
          securityDepositAmount: depositAmount,
          securityDepositDate: depositDate,
        },
      ],
      { session }
    );
    let result = created;

    // Auto-assign an available room + bed of the requested room type.
    const assigned = await occupancyService.assignTenantToBed({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: result._id,
      sharingType: sharing,
      session,
    });
    result = assigned.tenant;

    // Temporary tenants waiting for a permanent room type join the FIFO queue.
    if (isTemporary && preferredSharing) {
      await tempAllotmentService.enqueueTemporaryAllotment({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: result._id,
        requestedSharingType: Number(preferredSharing),
        tempRoomId: result.roomId,
        tempBedId: result.bedId,
        session,
      });
    }

    // Create first month's rent payment — includes the fixed ₹1,000 security
    // deposit if it hasn't been collected yet.
    const now = new Date();
    // Rent comes from the auto-assigned room/bed (the admin selects only a room type).
    const totalRent = result.monthlyRent || monthlyRent || 0;
    const combinedAmount = totalRent + (isSecurityDepositPaid ? 0 : depositAmount);

    if (isSecurityDepositPaid && depositAmount > 0) {
      await Payment.create(
        [
          {
            ownerId: f.ownerId,
            hostelId: f.hostelId,
            tenantId: result._id,
            amount: depositAmount,
            fineAmount: 0,
            totalAmount: depositAmount,
            paymentMonth: getEnglishMonthName(now),
            year: now.getFullYear(),
            dueDate: now,
            paidDate: now,
            paymentStatus: "paid",
            paymentMethod: "cash",
            paymentType: "deposit",
            notes: `Security deposit for ${result.name || result.personalInfo?.name || "new tenant"}`,
          },
        ],
        { session }
      );
    }

    if (combinedAmount > 0) {
      await Payment.create(
        [
          {
            ownerId: f.ownerId,
            hostelId: f.hostelId,
            tenantId: result._id,
            amount: combinedAmount,
            fineAmount: 0,
            totalAmount: combinedAmount,
            paymentMonth: getEnglishMonthName(now),
            year: now.getFullYear(),
            dueDate: new Date(now.getFullYear(), now.getMonth(), 7),
            paidDate: null,
            paymentStatus: "unpaid",
            paymentType: "rent",
            notes: isSecurityDepositPaid
              ? `First month rent for ${result.name || result.personalInfo?.name || "new tenant"}`
              : `First month rent (incl. security deposit ₹${depositAmount}) for ${result.name || result.personalInfo?.name || "new tenant"}`,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    await logActivity({
      ...f,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "tenant_created",
      entityType: "tenant",
      entityId: result._id,
    });

    emitTenantAssigned(req, result, assigned.bed);

    return success(
      res,
      {
        tenant: result,
        message: "Tenant created successfully. They can login using their mobile number and OTP.",
      },
      201
    );
  } catch (e) {
    await session.abortTransaction();
    if (e instanceof AppError) throw e;
    console.error("[createTenant]", e);
    throw new AppError("Failed to create tenant", 400);
  } finally {
    session.endSession();
  }
});

export const updateTenant = asyncHandler(async (req, res) => {
  const updates = { ...req.validated.body };

  // The security deposit is fixed at ₹1,000 — never persist a custom value.
  if (updates.isSecurityDepositPaid !== undefined) {
    updates.securityDepositAmount = updates.isSecurityDepositPaid
      ? TENANT_POLICY.SECURITY_DEPOSIT_AMOUNT
      : undefined; // undefined is stripped by Mongoose, leaving the stored amount intact
  }

  // Map display names to schema paths
  if (updates.name !== undefined) {
    updates["personalInfo.name"] = updates.name.trim();
    delete updates.name;
  }
  if (updates.phone !== undefined) {
    updates["personalInfo.phone"] = normalizePhone(updates.phone);
    delete updates.phone;
  }
  if (updates.email !== undefined) {
    updates["personalInfo.email"] = updates.email.trim().toLowerCase();
    delete updates.email;
  }

  const f = ownerFilter(req);

  // Uniqueness pre-checks (mirror createTenant) so a duplicate phone/email
  // returns a clean 409 field error instead of an unhandled E11000 500.
  if (updates["personalInfo.phone"] !== undefined) {
    const clash = await Tenant.findOne({
      "personalInfo.phone": updates["personalInfo.phone"],
      _id: { $ne: req.validated.params.id },
    });
    if (clash) {
      throw new AppError("A tenant with this mobile number already exists.", 409, {
        fieldErrors: { phone: ["A tenant with this mobile number already exists."] },
      });
    }
  }
  if (updates["personalInfo.email"] !== undefined) {
    const clash = await Tenant.findOne({
      "personalInfo.email": updates["personalInfo.email"],
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      _id: { $ne: req.validated.params.id },
    });
    if (clash) {
      throw new AppError("Tenant email already exists in this hostel", 409, {
        fieldErrors: { email: ["Tenant email already exists in this hostel"] },
      });
    }
  }

  // Deactivation via profile update is also a vacating path — an approved vacate
  // request cannot be forced early through it. The gate throws before the update.
  if (updates.isActive === false) {
    await vacateService.assertCanVacate({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: req.validated.params.id,
    });
  }

  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.validated.params.id, ...f },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!tenant) throw new AppError("Tenant not found", 404);

  // Deactivation must free the bed + schedule hard deletion, matching removeTenant.
  if (updates.isActive === false) {
    await occupancyService.freeTenantBed(tenant);
    tenant.scheduledDeletionDate = new Date(Date.now() + TENANT_POLICY.SCHEDULED_DELETION_MS);
    await tenant.save();
    // The vacating has actually been completed — mark the approved request done.
    await vacateService.completeVacateRequest({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: tenant._id,
    });
    // The freed bed may satisfy a waiting temporary-allotment request.
    tempAllotmentService
      .processWaitingQueue({
        ownerId: tenant.ownerId,
        hostelId: tenant.hostelId,
        io: req.app.get("io"),
      })
      .catch(() => {});
  }

  // If deposit was marked as paid in the update, create a Payment record
  if (updates.isSecurityDepositPaid === true) {
    const existingDeposit = await Payment.findOne({
      tenantId: tenant._id,
      paymentType: "deposit",
    });
    if (!existingDeposit) {
      // When createTenant ran with isSecurityDepositPaid: false, the first-month
      // rent invoice already folded in the security deposit — creating a separate
      // paid deposit record now would double-charge the tenant.
      const foldedDeposit = await Payment.findOne({
        tenantId: tenant._id,
        paymentType: "rent",
        paymentStatus: { $in: ["unpaid", "overdue"] },
        notes: /incl\. security deposit/i,
      });
      if (!foldedDeposit) {
        const now = new Date();
        const amount = TENANT_POLICY.SECURITY_DEPOSIT_AMOUNT; // deposit is fixed at ₹1,000
        await Payment.create({
          ownerId: tenant.ownerId,
          hostelId: tenant.hostelId,
          tenantId: tenant._id,
          amount,
          fineAmount: 0,
          totalAmount: amount,
          paymentMonth: getEnglishMonthName(now),
          year: now.getFullYear(),
          dueDate: now,
          paidDate: now,
          paymentStatus: "paid",
          paymentMethod: "cash",
          paymentType: "deposit",
          notes: `Security deposit for ${tenant.name || tenant.personalInfo?.name || "tenant"}`,
        });
      }
    }
  }

  // Broadcast so open views (tenant list, profile) update in real time.
  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("tenant_updated", {
      _id: tenant._id,
      hostelId: f.hostelId,
      isActive: tenant.isActive,
    });
  }

  return success(res, tenant);
});

export const assignBed = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const body = req.validated.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // The admin picks a room type; the server auto-assigns an available room +
    // bed. bedId / roomId are still accepted for backward compatibility.
    const result = await occupancyService.assignTenantToBed({
      ...f,
      tenantId: req.validated.params.id,
      ...(body.bedId
        ? { bedId: body.bedId }
        : body.sharingType
          ? { sharingType: Number(body.sharingType) }
          : { roomId: body.roomId }),
      session,
    });

    // Persist isTemporary / preferredSharing / idProof if provided
    const { isTemporary, preferredSharing, idProof } = body;
    if (isTemporary !== undefined || preferredSharing !== undefined || idProof !== undefined) {
      const tenantUpdate = {};
      if (isTemporary !== undefined) tenantUpdate.isTemporary = isTemporary;
      if (preferredSharing !== undefined) tenantUpdate.preferredSharing = preferredSharing;
      if (idProof !== undefined) tenantUpdate.idProof = idProof;
      await Tenant.findOneAndUpdate(
        { _id: req.validated.params.id, ownerId: f.ownerId, hostelId: f.hostelId },
        { $set: tenantUpdate },
        { session }
      );
    }

    // Temporary tenant waiting for a permanent type joins the FIFO queue.
    if (isTemporary && preferredSharing) {
      await tempAllotmentService.enqueueTemporaryAllotment({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: req.validated.params.id,
        requestedSharingType: Number(preferredSharing),
        tempRoomId: result.tenant.roomId,
        tempBedId: result.tenant.bedId,
        session,
      });
    }

    await session.commitTransaction();
    emitTenantAssigned(req, result.tenant, result.bed);
    // A shift released the tenant's previous bed — serve the waiting queue.
    tempAllotmentService
      .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
      .catch(() => {});
    return success(res, result);
  } catch (e) {
    await session.abortTransaction();
    // Preserve the specific availability/capacity message for inline display.
    if (e instanceof AppError) throw e;
    console.error("[assignBed]", e);
    throw new AppError("Failed to assign bed", 400);
  } finally {
    session.endSession();
  }
});

export const removeTenant = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (!tenant.isActive) throw new AppError("Tenant is already vacated", 400);

  // A tenant can only be vacated through an approved vacate request whose
  // approved vacating date has arrived (15-day minimum notice). Throws a 400
  // before any side effect when that is not the case — enforced even on direct
  // API calls.
  await vacateService.assertCanVacate({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    tenantId: tenant._id,
  });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await occupancyService.freeTenantBed(tenant, session);
    tenant.isActive = false;
    tenant.moveOutDate = new Date();
    // Schedule full deletion after the retention period
    tenant.scheduledDeletionDate = new Date(Date.now() + TENANT_POLICY.SCHEDULED_DELETION_MS);
    await tenant.save({ session });

    // The vacating has actually been completed — mark the approved request done.
    await vacateService.completeVacateRequest({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: tenant._id,
      session,
    });

    await session.commitTransaction();
  } catch (e) {
    await session.abortTransaction();
    throw e instanceof AppError ? e : new AppError("Failed to remove tenant", 400);
  } finally {
    session.endSession();
  }

  await logActivity({
    ...f,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "tenant_removed",
    entityType: "tenant",
    entityId: tenant._id,
  });

  emitTenantRemoved(req, tenant);
  // The released room/bed may satisfy a waiting temporary-allotment request.
  tempAllotmentService
    .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
    .catch(() => {});
  return success(res, {
    message:
      "Tenant marked as vacated. Their room allocation has been released and records will be retained for 15 days.",
  });
});

/**
 * Undo a vacating: restore the tenant to active, cancel the pending deletion,
 * and restore the previous room/bed when it is still available.
 */
export const undoVacate = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (tenant.isActive) throw new AppError("Tenant is not vacated", 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Find the last check-out to recover the previous room/bed.
    const lastCheckout = await RoomAssignmentHistory.findOne({
      tenantId: tenant._id,
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      action: "check_out",
    })
      .sort({ date: -1, _id: -1 })
      .session(session);

    // Restore the active status and cancel pending deletion timestamps.
    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $set: {
          isActive: true,
          moveOutDate: null,
          scheduledDeletionDate: null,
          scheduledDeactivationDate: null,
        },
      },
      { session }
    );

    let restored = false;
    if (lastCheckout?.bedId) {
      // Restore only if the previous bed is still free.
      const bed = await Bed.findOne({
        _id: lastCheckout.bedId,
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        occupancyStatus: "available",
        tenantId: null,
      }).session(session);

      if (bed) {
        await occupancyService.assignTenantToBed({
          ownerId: f.ownerId,
          hostelId: f.hostelId,
          tenantId: tenant._id,
          bedId: bed._id,
          session,
        });
        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: { isTemporary: false, preferredSharing: null, needsReassignment: false } },
          { session }
        );
        restored = true;
      } else {
        // The previous bed is gone — leave the tenant active but unassigned.
        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: { needsReassignment: true } },
          { session }
        );
      }
    } else {
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { needsReassignment: true } },
        { session }
      );
    }

    await session.commitTransaction();

    // Undo reverses the actual vacating — reopen a completed vacate request so
    // the approved request still stands (the admin can vacate on/after its date).
    await vacateService.reopenVacateRequest({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: tenant._id,
    });

    const fresh = await Tenant.findById(tenant._id);
    emitTenantAssigned(req, fresh, null);
    return success(res, {
      message: restored
        ? "Tenant restored to their previous room allocation."
        : "Tenant restored. The previous room is no longer available — please assign a new room.",
      tenant: fresh,
    });
  } catch (e) {
    await session.abortTransaction();
    throw e instanceof AppError ? e : new AppError("Failed to undo vacate", 400);
  } finally {
    session.endSession();
  }
});

export const getTenantHistory = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const history = await RoomAssignmentHistory.find({
    tenantId: req.validated.params.id,
    ownerId: f.ownerId,
    hostelId: f.hostelId,
  })
    .populate("floorId", "floorName floorNumber")
    .populate("roomId", "roomNumber")
    .populate("bedId", "bedNumber")
    .sort({ date: -1 });
  return success(res, history);
});

export const getTenantPayments = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const tenantId = req.validated.params.id;

  // Verify tenant exists and belongs to this owner/hostel
  const tenant = await Tenant.findOne({ _id: tenantId, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const payments = await Payment.find({ ...f, tenantId })
    .sort({ year: -1, dueDate: -1 })
    .limit(200);

  const totalPaid = payments
    .filter((p) => p.paymentStatus === "paid")
    .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);
  const totalDue = payments
    .filter((p) => p.paymentStatus === "unpaid" || p.paymentStatus === "overdue")
    .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);

  return success(res, { payments, totalPaid, totalDue });
});

// ── Convert Temporary to Permanent ──────────────────────────

export const convertToPermanent = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (!tenant.isTemporary) throw new AppError("Tenant is already permanent", 400);
  if (!tenant.preferredSharing)
    throw new AppError("No preferred room type set for this tenant", 400);

  // Find an available bed in a room matching the preferred sharing type.
  // Two-step, index-friendly approach (no full-collection $lookup).
  const candidateRooms = await Room.find({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    isActive: true,
    capacity: tenant.preferredSharing,
    $expr: { $lt: ["$occupiedBeds", "$capacity"] },
  }).select("_id");

  const availableBed = candidateRooms.length
    ? await Bed.findOne({
        roomId: { $in: candidateRooms.map((r) => r._id) },
        ...f,
        occupancyStatus: "available",
        tenantId: null,
        ...occupancyService.availableBedFilter(),
      })
    : null;

  if (!availableBed) {
    throw new AppError(
      `No ${tenant.preferredSharing}-sharing room available. Please wait until a bed opens up.`,
      400
    );
  }

  const bed = availableBed;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Free current bed (shift, not check-out — don't prorate rent)
    await occupancyService.freeTenantBed(tenant, session, { prorate: false });

    // Assign to new bed
    const result = await occupancyService.assignTenantToBed({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: tenant._id,
      bedId: bed._id,
      session,
    });

    // Clear temporary status
    await Tenant.findOneAndUpdate(
      { _id: tenant._id },
      {
        $set: {
          isTemporary: false,
          preferredSharing: null,
          temporaryAllotmentDate: null,
          permanentTargetBedId: null,
        },
      },
      { session }
    );

    await session.commitTransaction();

    await logActivity({
      ...f,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "tenant_converted_to_permanent",
      entityType: "tenant",
      entityId: tenant._id,
      metadata: {
        previousBedId: tenant.bedId,
        newBedId: bed._id,
        preferredSharing: tenant.preferredSharing,
      },
    });

    const io = req.app.get("io");
    if (io && f.hostelId) {
      io.to(`hostel_${f.hostelId}`).emit("tenant_assigned", {
        tenantId: tenant._id,
        message: `${tenant.personalInfo?.name || "A tenant"} moved to preferred room.`,
      });
    }

    // The released temporary bed may satisfy another waiting request.
    tempAllotmentService
      .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
      .catch(() => {});

    return success(res, {
      message: `Tenant converted to permanent and moved to ${tenant.preferredSharing}-sharing room successfully.`,
      tenant: result.tenant,
    });
  } catch (e) {
    await session.abortTransaction();
    console.error("[convertToPermanent]", e);
    throw new AppError("Failed to convert tenant to permanent", 400);
  } finally {
    session.endSession();
  }
});

// ── Incomplete Profile Validation ─────────────────────────

export const getIncompleteProfiles = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  // Project only the fields getMissingProfileFields consumes — no need to drag
  // the large base64 idProof/offlineBookingForm docs across the wire on every
  // dashboard load.
  const tenants = await Tenant.find({ ...f, isActive: true })
    .select(
      "personalInfo.name personalInfo.phone address emergencyContact aadhaarNumber idProof offlineBookingForm roomId bedId floorId"
    )
    .lean();

  const incomplete = tenants.map((t) => {
    const name = t.name || t.personalInfo?.name || "Unknown";
    const missing = getMissingProfileFields(t).map((m) => m.label);
    return {
      _id: t._id,
      name,
      missing,
      hostelId: t.hostelId,
      isComplete: missing.length === 0,
    };
  });

  return success(
    res,
    incomplete.filter((t) => !t.isComplete)
  );
});
