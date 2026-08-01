import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import {
  Room,
  Bed,
  Complaint,
  Payment,
  Notice,
  Tenant,
  BedShiftRequest,
  MealTiming,
  PaymentRequest,
  VacateRequest,
  ProfileUpdateRequest,
  Notification,
} from "../models/index.js";
import { getSlaDueAt } from "../services/authService.js";
import {
  groupPaymentsByStatus,
  syncPaymentStatusesOnly,
  checkPaymentRequestAmount,
} from "../services/paymentService.js";
import { escapeRegex } from "../utils/regex.js";
import { normalizePhone } from "../utils/phone.js";
import { daysBetweenStartOfDay } from "../utils/date.js";
import { getProfileCompleteness as computeProfileCompleteness } from "../utils/profileCompleteness.js";
import { TENANT as TENANT_POLICY } from "../utils/constants.js";

const scope = (req) => ({
  ownerId: req.user.ownerId,
  hostelId: req.user.hostelId,
});

export const getDashboard = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id).populate("roomId").populate("bedId");
  if (!tenant) throw new AppError("Tenant not found", 404);

  const [activeComplaints, dues, notices] = await Promise.all([
    Complaint.countDocuments({
      ...scope(req),
      tenantId: req.user.id,
      status: { $in: ["pending", "assigned", "in_progress"] },
    }),
    Payment.aggregate([
      {
        $match: {
          ownerId: new mongoose.Types.ObjectId(req.user.ownerId),
          hostelId: new mongoose.Types.ObjectId(req.user.hostelId),
          tenantId: tenant._id,
          paymentStatus: { $in: ["unpaid", "overdue", "partial"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    // Same visibility rules as listNotices (no system_ notices, not expired),
    // so the dashboard aggregate and the notice feed can never disagree.
    Notice.find({
      ...scope(req),
      isActive: true,
      type: { $not: /^system_/ },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
    })
      .select("-readBy")
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  return success(res, {
    tenant,
    activeComplaints,
    totalDue: dues[0]?.total ?? 0,
    recentNotices: notices,
  });
});

export const getRoomDetails = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.roomId) return success(res, null);

  const [room, bed] = await Promise.all([
    Room.findOne({ _id: tenant.roomId, ...scope(req) }),
    Bed.findOne({ _id: tenant.bedId, ...scope(req) }),
  ]);
  return success(res, { room, bed });
});

export const listPayments = asyncHandler(async (req, res) => {
  const f = scope(req);

  // Refresh stale unpaid → overdue transitions before reading, mirroring the
  // owner payment list, so a tenant always sees current statuses. Scoped to this
  // tenant only — a tenant read must not scan + bulk-write the whole hostel.
  await syncPaymentStatusesOnly(req.user.ownerId, req.user.hostelId, req.user.id);

  const payments = await Payment.find({
    ...f,
    tenantId: req.user.id,
  }).sort({ year: -1, dueDate: -1 });

  const grouped = groupPaymentsByStatus(payments);
  // Include partial payments so "total due" is never understated (a partial
  // payment still has an outstanding balance) — consistent with getDashboard.
  const totalDue = [...grouped.overdue, ...grouped.unpaid, ...grouped.partial].reduce(
    (sum, p) => sum + p.totalAmount,
    0
  );

  return success(res, {
    payments,
    grouped,
    totalDue,
    overdueCount: grouped.overdue.length,
    unpaidCount: grouped.unpaid.length,
    partialCount: grouped.partial.length,
  });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const query = {
    ...scope(req),
    tenantId: req.user.id,
  };
  const { status, search } = req.query;
  if (status === "in_progress") {
    query.status = { $in: ["in_progress", "assigned"] };
  } else if (status) {
    query.status = status;
  }
  if (search?.trim()) {
    const safeSearch = escapeRegex(search.trim());
    query.$or = [
      { description: { $regex: safeSearch, $options: "i" } },
      { title: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const complaints = await Complaint.find(query)
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("roomId", "roomNumber")
    .sort({ createdAt: -1 })
    .limit(50);
  return success(res, complaints);
});

export const createComplaint = asyncHandler(async (req, res) => {
  const { title, description, category, priority, imageUrl } = req.validated.body;
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive)
    throw new AppError("Account is deactivated. Contact your hostel admin.", 403);
  if (!tenant.bedId || !tenant.roomId || !tenant.floorId) {
    throw new AppError("You are not assigned to a bed. Contact your hostel admin.", 400);
  }

  const complaint = await Complaint.create({
    ...scope(req),
    tenantId: req.user.id,
    roomId: tenant?.roomId,
    bedId: tenant?.bedId,
    title: title?.trim() || "Support request",
    description,
    category,
    priority,
    imageUrl: imageUrl || undefined,
    slaDueAt: getSlaDueAt(priority),
    statusHistory: [
      {
        status: "pending",
        note: "Complaint submitted",
        changedBy: req.user.id,
        changedByRole: "tenant",
      },
    ],
  });

  const populated = await Complaint.findById(complaint._id)
    .populate("tenantId", "personalInfo.name personalInfo.email personalInfo.phone roomId")
    .populate("roomId", "roomNumber");

  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    // Broadcast a slim payload to the hostel room — never the fully-populated
    // complaint (which carries the tenant's PII: name, email, phone).
    io.to(`hostel_${req.user.hostelId}`).emit("complaint_created", {
      // `_id` (and `id` alias) so the owner's real-time card gets a valid key
      // and a working status-update button without waiting for a refetch.
      _id: complaint._id,
      id: complaint._id,
      title: complaint.title,
      status: complaint.status,
      category: complaint.category,
      createdAt: complaint.createdAt,
      room: populated.roomId?.roomNumber ?? null,
    });
  }

  return success(res, populated, 201);
});

export const listNotices = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
  const notices = await Notice.find({
    ...scope(req),
    isActive: true,
    type: { $not: /^system_/ },
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  // Expose only the requesting tenant's read state and strip the full readBy
  // array (it lists every tenant's ObjectId — an enumeration surface).
  const result = notices.map((n) => {
    const plain = n.toObject();
    plain.isRead =
      Array.isArray(plain.readBy) && plain.readBy.some((id) => String(id) === String(req.user.id));
    delete plain.readBy;
    return plain;
  });
  return success(res, result);
});

export const requestBedShift = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Account is deactivated", 403);
  if (!tenant?.bedId) throw new AppError("No bed assigned", 400);

  // The requested room must belong to the tenant's own hostel and be active —
  // otherwise the request is structurally impossible to approve (owner-side bed
  // lookups are scoped to the owner's hostel).
  const room = await Room.findOne({
    _id: req.validated.body.requestedRoomId,
    ...scope(req),
    isActive: true,
  });
  if (!room) throw new AppError("Requested room not found in your hostel", 400);

  const pending = await BedShiftRequest.findOne({
    ...scope(req),
    tenantId: req.user.id,
    status: "pending",
  });
  if (pending) throw new AppError("You already have a pending bed shift request", 400);

  const request = await BedShiftRequest.create({
    ...scope(req),
    tenantId: req.user.id,
    currentBedId: tenant.bedId,
    requestedRoomId: room._id,
    reason: req.validated.body.reason,
  });
  return success(res, request, 201);
});

export const listBedShiftRequests = asyncHandler(async (req, res) => {
  const requests = await BedShiftRequest.find({
    ...scope(req),
    tenantId: req.user.id,
  })
    .populate("currentBedId", "bedNumber")
    .populate("requestedRoomId", "roomNumber")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const markNoticeRead = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant || !tenant.isActive) throw new AppError("Tenant not found", 404);

  // Apply the same visibility filter as listNotices — a tenant can only mark a
  // notice read if it is actually visible in their feed.
  const notice = await Notice.findOneAndUpdate(
    {
      _id: req.validated.params.id,
      ownerId: req.user.ownerId,
      hostelId: req.user.hostelId,
      isActive: true,
      type: { $not: /^system_/ },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
    },
    { $addToSet: { readBy: req.user.id } },
    { new: true }
  );
  if (!notice) throw new AppError("Notice not found", 404);
  return success(res, { _id: notice._id, isRead: true });
});

// ── Meal Timings (tenant view-only) ────────────────────────

export const listMealTimings = asyncHandler(async (req, res) => {
  const { mealType, dayOfWeek } = req.query;
  const f = {
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    isActive: true,
  };
  if (mealType) f.mealType = mealType;

  // Requesting a specific day also includes "Every Day" entries — parity with
  // the owner controller (used for a "Today's menu" surface).
  if (dayOfWeek !== undefined) {
    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new AppError("dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)", 400);
    }
    const timings = await MealTiming.find({
      ...f,
      $or: [{ dayOfWeek: day }, { dayOfWeek: null }],
    }).sort({ mealType: 1, dayOfWeek: 1 });
    return success(res, timings);
  }

  const timings = await MealTiming.find(f).sort({ mealType: 1, dayOfWeek: 1 });
  return success(res, timings);
});

// ── Payment Requests (tenant) ──────────────────────────────

export const createPaymentRequest = asyncHandler(async (req, res) => {
  const { paymentMonth, year, amount, paymentProof, notes } = req.validated.body;
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Account is deactivated", 403);

  // Prevent duplicate requests for same period
  const existingRequest = await PaymentRequest.findOne({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    paymentMonth,
    year,
    status: { $in: ["pending", "approved"] },
  });
  if (existingRequest)
    throw new AppError(`You already submitted a payment request for ${paymentMonth} ${year}`, 409);

  // Check if already paid for this month (scoped like every other query in this file)
  const existingPayment = await Payment.findOne({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    paymentMonth,
    year,
    paymentType: { $ne: "deposit" },
    paymentStatus: "paid",
  });
  if (existingPayment) throw new AppError(`You already paid rent for ${paymentMonth} ${year}`, 409);

  // The requested amount must match the tenant's outstanding rent invoice for
  // the period — prevents under/over-booking an arbitrary figure.
  const invoice = await Payment.findOne({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    paymentMonth,
    year,
    paymentType: "rent",
    paymentStatus: { $in: ["unpaid", "overdue", "partial"] },
  }).sort({ createdAt: -1 });

  const amountCheck = checkPaymentRequestAmount(amount, invoice);
  if (!amountCheck.ok) throw new AppError(amountCheck.message, 400);

  const request = await PaymentRequest.create({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    paymentMonth,
    year,
    amount,
    paymentProof: paymentProof || "",
    notes: notes || "",
    status: "pending",
  });

  // Broadcast so the admin's payment-requests list updates in real time. Slim
  // payload — the client treats it as a refetch trigger only, and broadcasting
  // the tenant's id + amount to the whole hostel would leak financial metadata
  // to other residents (mirrors the slimmed complaint events).
  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("payment_request_created", {
      _id: request._id,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  return success(res, request, 201);
});

export const listPaymentRequests = asyncHandler(async (req, res) => {
  const requests = await PaymentRequest.find({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
  })
    .populate("reviewedBy", "name")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

// ── Vacate Requests ─────────────────────────────────────────

export const createVacateRequest = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Account is deactivated", 403);

  const { requestedVacateDate, reason } = req.validated.body;
  const vacateDate = new Date(requestedVacateDate);
  const now = new Date();

  // Compare start-of-day dates so a partial day doesn't round up (e.g. a request
  // made at 23:59 for a date 14 days + 1 minute away must NOT count as 15 days).
  const diffDays = daysBetweenStartOfDay(now, vacateDate);

  if (diffDays < TENANT_POLICY.VACATE_MIN_NOTICE_DAYS) {
    throw new AppError(
      `Vacate request must be submitted at least ${TENANT_POLICY.VACATE_MIN_NOTICE_DAYS} days before the intended vacating date.`,
      400
    );
  }

  const existingRequest = await VacateRequest.findOne({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    status: "pending",
    isActive: true,
  });
  if (existingRequest) {
    throw new AppError("You already have a pending vacate request.", 400);
  }

  const request = await VacateRequest.create({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    requestedVacateDate: vacateDate,
    reason: reason || "",
  });

  // Broadcast so the admin's vacate-requests page updates in real time.
  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("vacate_request_created", {
      _id: request._id,
      tenantId: request.tenantId,
      requestedVacateDate: request.requestedVacateDate,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  return success(res, request, 201);
});

export const listVacateRequests = asyncHandler(async (req, res) => {
  const requests = await VacateRequest.find({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
  }).sort({ createdAt: -1 });
  return success(res, requests);
});

// ── Rooms (tenant view — for bed-shift room picker) ─────────

export const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ ...scope(req), isActive: true })
    .select("roomNumber floor capacity roomType pricing")
    .sort({ floor: 1, roomNumber: 1 });
  return success(res, rooms);
});

// ── Profile Completeness (tenant-facing) ────────────────────

export const getProfileCompleteness = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Tenant not found", 404);
  // tenantFacing: only fields the tenant can correct themselves via a profile
  // change request (documents / room are owner-managed).
  return success(res, computeProfileCompleteness(tenant, { tenantFacing: true }));
});

// ── Profile Update Requests (tenant) ────────────────────────

export const createProfileRequest = asyncHandler(async (req, res) => {
  const { documents, ...textChanges } = req.validated.body;
  const changes = { ...textChanges };
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Account is deactivated", 403);

  // Normalize the same way createTenant/updateTenant do.
  if (changes.phone) changes.phone = normalizePhone(changes.phone);
  if (changes.email) changes.email = changes.email.trim().toLowerCase();

  const current = {
    name: tenant.personalInfo?.name || "",
    phone: tenant.personalInfo?.phone || "",
    email: tenant.personalInfo?.email || "",
    address: tenant.address || "",
    emergencyContact: tenant.emergencyContact || "",
    aadhaarNumber: tenant.aadhaarNumber || null,
  };

  // Accept the request if any text field differs OR new documents are attached.
  const hasTextDiff = Object.keys(changes).some(
    (k) => String(changes[k] ?? "") !== String(current[k] ?? "")
  );
  const hasDocs = Array.isArray(documents) && documents.length > 0;
  if (!hasTextDiff && !hasDocs) {
    throw new AppError(
      "No changes to submit — the requested values already match your profile.",
      400
    );
  }

  const pending = await ProfileUpdateRequest.findOne({
    ...scope(req),
    tenantId: req.user.id,
    status: "pending",
  });
  if (pending) throw new AppError("You already have a pending profile update request.", 400);

  const request = await ProfileUpdateRequest.create({
    ...scope(req),
    tenantId: req.user.id,
    requestedChanges: {
      ...changes,
      ...(hasDocs ? { documents } : {}),
    },
    currentSnapshot: current,
    status: "pending",
  });

  // Broadcast so the admin's profile-requests page updates in real time.
  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("profile_request_created", {
      _id: request._id,
      tenantId: request.tenantId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  return success(res, request, 201);
});

export const listProfileRequests = asyncHandler(async (req, res) => {
  const requests = await ProfileUpdateRequest.find({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
  })
    .populate("reviewedBy", "name")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

// ── Notification Inbox (durable) ──────────────────────────────

export const listInbox = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({
      ownerId: req.user.ownerId,
      hostelId: req.user.hostelId,
      tenantId: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(limit),
    Notification.countDocuments({
      ownerId: req.user.ownerId,
      hostelId: req.user.hostelId,
      tenantId: req.user.id,
      read: false,
    }),
  ]);
  return success(res, { notifications, unreadCount });
});

export const markInboxRead = asyncHandler(async (req, res) => {
  const updated = await Notification.updateOne(
    {
      _id: req.validated.params.id,
      ownerId: req.user.ownerId,
      hostelId: req.user.hostelId,
      tenantId: req.user.id,
    },
    { $set: { read: true } }
  );
  if (updated.matchedCount === 0) throw new AppError("Notification not found", 404);
  return success(res, { _id: req.validated.params.id, read: true });
});

export const markAllInboxRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      ownerId: req.user.ownerId,
      hostelId: req.user.hostelId,
      tenantId: req.user.id,
      read: false,
    },
    { $set: { read: true } }
  );
  return success(res, { message: "All notifications marked as read" });
});

// ── Delete own requests (pending only — cancel a mistaken submission) ──

export const deleteBedShiftRequest = asyncHandler(async (req, res) => {
  const request = await BedShiftRequest.findOneAndDelete({
    _id: req.validated.params.id,
    ...scope(req),
    tenantId: req.user.id,
    status: "pending",
  });
  if (!request) {
    throw new AppError("Request not found or no longer pending", 404);
  }

  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("bed_shift_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Room shift request deleted" });
});

export const deleteVacateRequest = asyncHandler(async (req, res) => {
  const request = await VacateRequest.findOneAndDelete({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    status: "pending",
  });
  if (!request) {
    throw new AppError("Request not found or no longer pending", 404);
  }

  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("vacate_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Vacate request deleted" });
});

export const deleteProfileRequest = asyncHandler(async (req, res) => {
  const request = await ProfileUpdateRequest.findOneAndDelete({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    status: "pending",
  });
  if (!request) {
    throw new AppError("Request not found or no longer pending", 404);
  }

  const io = req.app.get("io");
  if (io && req.user.hostelId) {
    io.to(`hostel_${req.user.hostelId}`).emit("profile_request_updated", {
      _id: request._id,
      status: "deleted",
      tenantId: request.tenantId,
    });
  }
  return success(res, { message: "Profile update request deleted" });
});
