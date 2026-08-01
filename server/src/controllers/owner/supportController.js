import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import { getSlaDueAt } from "../../services/authService.js";
import {
  Complaint,
  Notice,
  BedShiftRequest,
  VacateRequest,
  Tenant,
  Bed,
} from "../../models/index.js";
import { ownerFilter } from "../../utils/scope.js";
import * as occupancyService from "../../services/occupancyService.js";
import * as tempAllotmentService from "../../services/tempAllotmentService.js";
import { createTenantNotification, notifyAllTenants } from "../../services/notificationService.js";
import { escapeRegex } from "../../utils/regex.js";
import { BED_SHIFT as BED_SHIFT_POLICY } from "../../utils/constants.js";

export const listComplaints = asyncHandler(async (req, res) => {
  const query = { ...ownerFilter(req) };
  const { status, search } = req.query;

  if (status === "in_progress") {
    query.status = { $in: ["in_progress", "assigned"] };
  } else if (status) {
    query.status = status;
  }

  if (search?.trim()) {
    const safeSearch = escapeRegex(search.trim());
    const tenants = await Tenant.find({
      ...ownerFilter(req),
      "personalInfo.name": { $regex: safeSearch, $options: "i" },
    }).select("_id");
    query.$or = [
      { description: { $regex: safeSearch, $options: "i" } },
      { title: { $regex: safeSearch, $options: "i" } },
      { category: { $regex: safeSearch, $options: "i" } },
      ...(tenants.length ? [{ tenantId: { $in: tenants.map((t) => t._id) } }] : []),
    ];
  }

  const complaints = await Complaint.find(query)
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("roomId", "roomNumber")
    .sort({ createdAt: -1 })
    .limit(100);
  return success(res, complaints);
});

export const updateComplaint = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const complaint = await Complaint.findOne({ _id: req.validated.params.id, ...f });
  if (!complaint) throw new AppError("Complaint not found", 404);

  const prevStatus = complaint.status;
  const { status, priority, assignedTo, note } = req.validated.body;
  let statusChanged = false;
  if (status && status !== complaint.status) {
    complaint.statusHistory.push({
      status,
      note: note ?? `Status changed to ${status}`,
      changedBy: req.user.id,
      changedByRole: req.user.role,
    });
    complaint.status = status;
    statusChanged = true;
    if (status === "resolved") complaint.resolvedAt = new Date();
  } else if (note && note.trim()) {
    // Admin reply / follow-up without a status change — persisted as a history
    // entry so the ticket owner sees the note in their timeline.
    complaint.statusHistory.push({
      status: complaint.status,
      note: note.trim(),
      changedBy: req.user.id,
      changedByRole: req.user.role,
    });
  }
  if (priority) {
    complaint.priority = priority;
    complaint.slaDueAt = getSlaDueAt(priority);
  }
  if (assignedTo !== undefined) complaint.assignedTo = assignedTo;
  await complaint.save();

  // Notify the ticket owner (status change or a reply note) via the durable inbox.
  const noteText = note?.trim();
  const notifMessage = statusChanged
    ? `Your support ticket status is now "${status.replace("_", " ")}".${noteText ? ` ${noteText}` : ""}`
    : noteText
      ? `Admin replied: ${noteText}`
      : null;
  if (notifMessage) {
    createTenantNotification({
      ownerId: f.ownerId,
      hostelId: complaint.hostelId,
      tenantId: complaint.tenantId,
      type: "complaint",
      title: prevStatus === "pending" && statusChanged ? "Support ticket update" : "Support reply",
      message: notifMessage,
      io: req.app.get("io"),
    }).catch(() => {});
  }

  const populated = await Complaint.findById(complaint._id)
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("roomId", "roomNumber");

  const io = req.app.get("io");
  if (io) {
    // Slim the shared-hostel-room payload — don't broadcast the tenant's PII
    // (name, email, phone) that populate() attached. The admin response body
    // below still carries the full populated complaint.
    io.to(`hostel_${complaint.hostelId}`).emit("complaint_updated", {
      _id: complaint._id,
      id: complaint._id,
      title: complaint.title,
      status: complaint.status,
      category: complaint.category,
      createdAt: complaint.createdAt,
    });
  }

  return success(res, populated);
});

export const listNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find(ownerFilter(req)).sort({ createdAt: -1 }).limit(100);
  return success(res, notices);
});

export const createNotice = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const notice = await Notice.create({ ...f, ...req.validated.body, isActive: true });

  const io = req.app.get("io");
  if (io) {
    io.to(`hostel_${notice.hostelId}`).emit("notice_created", notice);
  }

  // Durable per-tenant notification for the new broadcast notice.
  notifyAllTenants({
    ownerId: f.ownerId,
    hostelId: notice.hostelId,
    type: "notice",
    title: "New hostel notice",
    message: notice.title,
    io,
  }).catch(() => {});

  return success(res, notice, 201);
});

export const deleteNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findOneAndDelete({
    _id: req.validated.params.id,
    ...ownerFilter(req),
  });
  if (!notice) throw new AppError("Notice not found", 404);

  const io = req.app.get("io");
  if (io && notice.hostelId) {
    io.to(`hostel_${notice.hostelId}`).emit("notice_deleted", { _id: notice._id });
  }

  return success(res, { message: "Notice deleted" });
});

export const listBedShiftRequests = asyncHandler(async (req, res) => {
  const requests = await BedShiftRequest.find(ownerFilter(req))
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("currentBedId", "bedNumber")
    .populate("requestedRoomId", "roomNumber floor capacity")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const updateBedShiftRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await BedShiftRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Request not found", 404);

  const { status, ownerNote } = req.validated.body;
  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("Invalid status", 400);
  }
  if (request.status !== "pending") throw new AppError("Request already reviewed", 400);

  if (status === "approved") {
    const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
    if (!tenant?.isActive) throw new AppError("Tenant not found or inactive", 404);

    const availableBed = await Bed.findOne({
      roomId: request.requestedRoomId,
      ...f,
      occupancyStatus: "available",
      ...occupancyService.availableBedFilter(),
    });
    if (!availableBed) throw new AppError("No available beds in the requested room", 400);

    // The tenant's current bed is freed by the shift below. Hold it so the
    // waiting queue / other allocations can't immediately re-claim it — an admin
    // Undo within the window can then move the tenant back.
    const oldBedId = request.currentBedId;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await occupancyService.assignTenantToBed({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: tenant._id,
        bedId: availableBed._id,
        session,
      });
      if (oldBedId) {
        await Bed.updateOne(
          { _id: oldBedId, ...f },
          { $set: { holdUntil: new Date(Date.now() + BED_SHIFT_POLICY.HOLD_RELEASE_MS) } },
          { session }
        );
      }
      // Persist the review outcome inside the same transaction as the move.
      request.status = status;
      request.ownerNote = ownerNote;
      await request.save({ session });
      await session.commitTransaction();
      // The shift released the tenant's previous bed — serve the waiting queue.
      tempAllotmentService
        .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
        .catch(() => {});
    } catch (err) {
      await session.abortTransaction();
      // Don't leak internal error details to the client; log them server-side.
      console.error("[updateBedShiftRequest]", err);
      throw new AppError("Failed to shift tenant to new bed", 400);
    } finally {
      session.endSession();
    }
  } else {
    request.status = status;
    request.ownerNote = ownerNote;
    await request.save();
  }

  // Notify the requesting tenant in real time so their request list updates
  // without a manual refetch (mirrors vacate_request_updated).
  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("bed_shift_request_updated", {
      _id: request._id,
      status: request.status,
      tenantId: request.tenantId,
      ownerNote: request.ownerNote,
    });
  }

  // Durable inbox entry for the requesting tenant.
  createTenantNotification({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    tenantId: request.tenantId,
    type: "bed_shift",
    title: request.status === "approved" ? "Room shift approved" : "Room shift rejected",
    message:
      request.status === "approved"
        ? "Your room shift request was approved."
        : `Your room shift request was rejected.${request.ownerNote ? ` Reason: ${request.ownerNote}` : ""}`,
    io,
  }).catch(() => {});

  return success(res, request);
});

// ── Vacate Requests (admin review) ──────────────────────────

export const listVacateRequests = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status } = req.query;
  const query = { ...f };
  if (status) query.status = status;

  const requests = await VacateRequest.find(query)
    .populate(
      "tenantId",
      "personalInfo.name personalInfo.email personalInfo.phone monthlyRent roomId"
    )
    .populate("tenantId.roomId", "roomNumber")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const reviewVacateRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status, reviewNotes } = req.validated.body;
  const request = await VacateRequest.findOne({ _id: req.validated.params.id, ...f });

  if (!request) throw new AppError("Vacate request not found", 404);
  if (request.status !== "pending") throw new AppError("Vacate request already reviewed", 400);

  if (status === "approved") {
    const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
    if (!tenant) throw new AppError("Tenant not found", 404);

    // Approval only stores the review outcome — it does NOT deactivate the
    // tenant. The approved vacating date is the tenant's requested date (already
    // validated to satisfy the minimum 15-day notice). The tenant stays active
    // in their room until that date; the admin completes the actual vacating
    // manually on or after it (enforced by assertCanVacate on removeTenant).
    request.reviewedBy = req.user.id;
    request.reviewDate = new Date();
    request.reviewNotes = reviewNotes || "";
    request.approvedVacateDate = request.requestedVacateDate;
    request.status = "approved";
    await request.save();

    const io = req.app.get("io");
    if (io && f.hostelId) {
      io.to(`hostel_${f.hostelId}`).emit("vacate_request_updated", {
        _id: request._id,
        status: request.status,
        tenantId: request.tenantId,
        approvedVacateDate: request.approvedVacateDate,
        reviewNotes: request.reviewNotes,
      });
    }

    const dateStr = new Date(request.requestedVacateDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Durable inbox entry for the tenant.
    createTenantNotification({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: request.tenantId,
      type: "vacate",
      title: "Vacate request approved",
      message: `Your vacate request was approved. Vacating can be completed on or after ${dateStr}.`,
      io: req.app.get("io"),
    }).catch(() => {});

    return success(res, {
      message: `Vacate request approved. The tenant can be vacated on or after ${dateStr}.`,
      request,
    });
  }

  // Rejected
  request.status = "rejected";
  request.reviewedBy = req.user.id;
  request.reviewDate = new Date();
  request.reviewNotes = reviewNotes || "";
  await request.save();

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("vacate_request_updated", {
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
    type: "vacate",
    title: "Vacate request rejected",
    message: `Your vacate request was rejected.${request.reviewNotes ? ` Reason: ${request.reviewNotes}` : ""}`,
    io,
  }).catch(() => {});

  return success(res, { message: "Vacate request rejected.", request });
});

// ── Bed Shift Requests (undo / delete) ─────────────────────

/**
 * Revert a reviewed bed-shift request back to pending.
 * - Rejected → pending: no side effects.
 * - Approved → pending: best-effort move the tenant back to the bed they were
 *   in before the shift (request.currentBedId). That bed is held after approval,
 *   so it is usually still available. If it isn't, the tenant stays in the new
 *   room and `movedBack` is false so the caller can tell the admin.
 */
export const undoBedShiftRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await BedShiftRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Request not found", 404);
  if (request.status === "pending") throw new AppError("Request is still pending", 400);

  // Guard the partial-unique pending index — the tenant must not already have
  // another pending request of this type.
  const dupPending = await BedShiftRequest.findOne({
    ...f,
    tenantId: request.tenantId,
    status: "pending",
    _id: { $ne: request._id },
  });
  if (dupPending)
    throw new AppError("Tenant already has another pending room shift request — cannot undo.", 400);

  let movedBack = false;

  if (request.status === "approved") {
    const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
    if (tenant?.isActive && tenant.bedId) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Move the tenant back to their previous bed if it's still available.
        const oldBed = await Bed.findOne({
          _id: request.currentBedId,
          ...f,
          occupancyStatus: "available",
          tenantId: null,
        }).session(session);

        if (oldBed) {
          // Free the tenant's current (new) bed first — no rent proration for a shift.
          if (tenant.bedId.toString() !== oldBed._id.toString()) {
            await occupancyService.freeTenantBed(tenant, session, { prorate: false });
          }
          const claimed = await Bed.findOneAndUpdate(
            { _id: oldBed._id, occupancyStatus: "available", tenantId: null },
            { $set: { occupancyStatus: "occupied", tenantId: tenant._id, holdUntil: null } },
            { new: true, session }
          );
          if (claimed) {
            tenant.roomId = oldBed.roomId;
            tenant.bedId = oldBed._id;
            tenant.floorId = oldBed.floorId ?? null;
            tenant.needsReassignment = false;
            await tenant.save({ session });
            await occupancyService.recalculateRoomOccupancy(oldBed.roomId, session);
            movedBack = true;
          }
        }

        request.status = "pending";
        request.ownerNote = "";
        await request.save({ session });
        await session.commitTransaction();
      } catch (err) {
        await session.abortTransaction();
        throw err instanceof AppError
          ? err
          : new AppError("Failed to undo room shift request", 400);
      } finally {
        session.endSession();
      }
    } else {
      // Tenant gone/inactive — just restore the request status.
      request.status = "pending";
      request.ownerNote = "";
      await request.save();
    }
  } else {
    request.status = "pending";
    request.ownerNote = "";
    await request.save();
  }

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("bed_shift_request_updated", {
      _id: request._id,
      status: request.status,
      tenantId: request.tenantId,
    });
  }

  return success(res, {
    request,
    movedBack,
    message: movedBack
      ? "Room shift undone — tenant moved back to their previous bed."
      : "Room shift request restored to pending. The tenant stays in the current room (previous bed was no longer available).",
  });
});

/** Admin cleanup — permanently remove a bed-shift request from the hostel. */
export const deleteBedShiftRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await BedShiftRequest.findOneAndDelete({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Request not found", 404);

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("bed_shift_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Room shift request deleted" });
});

// ── Vacate Requests (undo / delete) ────────────────────────

/**
 * Revert a reviewed vacate request back to pending.
 * Approved requests only store the review outcome (the tenant stays active), so
 * undoing just clears the approval fields — no tenant-side effect to reverse.
 */
export const undoVacateRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await VacateRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Vacate request not found", 404);
  if (request.status === "pending") throw new AppError("Request is still pending", 400);
  if (request.status === "completed")
    throw new AppError("Cannot undo a completed vacate request", 400);

  const dupPending = await VacateRequest.findOne({
    ...f,
    tenantId: request.tenantId,
    status: "pending",
    isActive: true,
    _id: { $ne: request._id },
  });
  if (dupPending)
    throw new AppError("Tenant already has another pending vacate request — cannot undo.", 400);

  request.status = "pending";
  request.reviewedBy = null;
  request.reviewDate = null;
  request.reviewNotes = "";
  request.approvedVacateDate = null;
  await request.save();

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("vacate_request_updated", {
      _id: request._id,
      status: request.status,
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Vacate request undone — back to pending.", request });
});

/**
 * Admin cleanup for vacate requests.
 * Approved vacate requests are REQUIRED by the vacating-completion flow
 * (assertCanVacate) and must persist until the tenant is actually vacated —
 * refuse to delete those. Rejected / completed ones may be cleaned up.
 */
export const deleteVacateRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const request = await VacateRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Vacate request not found", 404);
  if (request.status === "approved") {
    throw new AppError(
      "Approved vacate requests cannot be deleted until the tenant has been vacated",
      400
    );
  }

  await request.deleteOne();

  const io = req.app.get("io");
  if (io && f.hostelId) {
    io.to(`hostel_${f.hostelId}`).emit("vacate_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Vacate request deleted" });
});
