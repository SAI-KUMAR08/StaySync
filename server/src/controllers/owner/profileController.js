import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import { Owner, Tenant, ProfileUpdateRequest } from "../../models/index.js";
import { ownerFilter } from "../../utils/scope.js";
import { normalizePhone } from "../../utils/phone.js";
import { createTenantNotification } from "../../services/notificationService.js";

export const listProfileRequests = asyncHandler(async (req, res) => {
  const query = { ...ownerFilter(req) };
  const { status } = req.query;
  if (status) query.status = status;

  const requests = await ProfileUpdateRequest.find(query)
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("reviewedBy", "name")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const reviewProfileRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status, reviewNotes } = req.validated.body;
  const request = await ProfileUpdateRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Profile update request not found", 404);
  if (request.status !== "pending")
    throw new AppError("Profile update request already reviewed", 400);

  const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);

  if (status === "approved") {
    const changes = request.requestedChanges || {};
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Uniqueness checks BEFORE applying (mirror createTenant) — inside the
      // transaction so an abort leaves the tenant untouched.
      const set = {};
      if (changes.name) set["personalInfo.name"] = changes.name.trim();
      if (changes.phone) {
        const phone = normalizePhone(changes.phone);
        if (phone === tenant.emergencyContact) {
          throw new AppError("Mobile number must be different from the Emergency Contact.", 400, {
            fieldErrors: { phone: ["Mobile number must be different from the Emergency Contact."] },
          });
        }
        const clash = await Tenant.findOne({
          "personalInfo.phone": phone,
          _id: { $ne: tenant._id },
        }).session(session);
        if (clash) {
          throw new AppError("A tenant with this mobile number already exists.", 409, {
            fieldErrors: { phone: ["A tenant with this mobile number already exists."] },
          });
        }
        set["personalInfo.phone"] = phone;
      }
      if (changes.email) {
        const email = changes.email.trim().toLowerCase();
        const ownerClash = await Owner.findOne({ email }).session(session);
        if (ownerClash) throw new AppError("Email is already used by a hostel owner", 409);
        const tenantClash = await Tenant.findOne({
          "personalInfo.email": email,
          ownerId: f.ownerId,
          hostelId: f.hostelId,
          _id: { $ne: tenant._id },
        }).session(session);
        if (tenantClash) throw new AppError("Tenant email already exists in this hostel", 409);
        set["personalInfo.email"] = email;
      }
      if (changes.address) set.address = changes.address.trim();
      if (changes.emergencyContact) set.emergencyContact = changes.emergencyContact;
      if (changes.aadhaarNumber) set.aadhaarNumber = changes.aadhaarNumber;

      if (Object.keys(set).length > 0) {
        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: set },
          { session, runValidators: true }
        );
      }

      request.status = "approved";
      request.reviewedBy = req.user.id;
      request.reviewDate = new Date();
      request.reviewNotes = reviewNotes || "";
      await request.save({ session });

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e instanceof AppError ? e : new AppError("Failed to approve profile update", 400);
    } finally {
      session.endSession();
    }

    const io = req.app.get("io");
    if (io && f.hostelId) {
      io.to(`hostel_${f.hostelId}`).emit("profile_request_updated", {
        _id: request._id,
        status: request.status,
        tenantId: request.tenantId,
        reviewNotes: request.reviewNotes,
      });
    }

    // Durable inbox entry for the tenant.
    createTenantNotification({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: request.tenantId,
      type: "profile",
      title: "Profile update approved",
      message: "Your profile update was approved and applied.",
      io,
    }).catch(() => {});

    return success(res, {
      message: "Profile update approved and applied to the tenant's record.",
      request,
    });
  }

  // Rejected — the tenant's official profile stays untouched.
  request.status = "rejected";
  request.reviewedBy = req.user.id;
  request.reviewDate = new Date();
  request.reviewNotes = reviewNotes || "";
  await request.save();

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("profile_request_updated", {
      _id: request._id,
      status: request.status,
      tenantId: request.tenantId,
      reviewNotes: request.reviewNotes,
    });
  }

  // Durable inbox entry for the tenant.
  createTenantNotification({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    tenantId: request.tenantId,
    type: "profile",
    title: "Profile update rejected",
    message: `Your profile update was rejected.${request.reviewNotes ? ` Reason: ${request.reviewNotes}` : ""}`,
    io,
  }).catch(() => {});

  return success(res, {
    message: "Profile update request rejected. The tenant's profile is unchanged.",
    request,
  });
});

// ── Profile Update Requests (undo / delete) ─────────────────

/**
 * Revert a reviewed profile request back to pending.
 * An approved request applied `requestedChanges` to the tenant's record — undo
 * restores those fields from `currentSnapshot` (the values captured at request
 * time), then clears the review outcome.
 */
export const undoProfileRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await ProfileUpdateRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Profile update request not found", 404);
  if (request.status === "pending") throw new AppError("Request is still pending", 400);

  const dupPending = await ProfileUpdateRequest.findOne({
    ...f,
    tenantId: request.tenantId,
    status: "pending",
    _id: { $ne: request._id },
  });
  if (dupPending)
    throw new AppError("Tenant already has another pending profile request — cannot undo.", 400);

  if (request.status === "approved") {
    const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
    if (!tenant) throw new AppError("Tenant not found", 404);

    const changes = request.requestedChanges || {};
    const snap = request.currentSnapshot || {};
    const set = {};
    if (changes.name) set["personalInfo.name"] = snap.name;
    if (changes.phone) set["personalInfo.phone"] = snap.phone;
    if (changes.email) set["personalInfo.email"] = snap.email;
    if (changes.address) set.address = snap.address;
    if (changes.emergencyContact) set.emergencyContact = snap.emergencyContact;
    if (changes.aadhaarNumber) set.aadhaarNumber = snap.aadhaarNumber;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (Object.keys(set).length > 0) {
        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: set },
          { session, runValidators: true }
        );
      }
      request.status = "pending";
      request.reviewedBy = null;
      request.reviewDate = null;
      request.reviewNotes = "";
      await request.save({ session });
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e instanceof AppError ? e : new AppError("Failed to undo profile update", 400);
    } finally {
      session.endSession();
    }
  } else {
    request.status = "pending";
    request.reviewedBy = null;
    request.reviewDate = null;
    request.reviewNotes = "";
    await request.save();
  }

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("profile_request_updated", {
      _id: request._id,
      status: request.status,
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Profile update request undone — back to pending.", request });
});

/** Admin cleanup — permanently remove a profile update request from the hostel. */
export const deleteProfileRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await ProfileUpdateRequest.findOneAndDelete({
    _id: req.validated.params.id,
    ...f,
  });
  if (!request) throw new AppError("Profile update request not found", 404);

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("profile_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Profile update request deleted" });
});
