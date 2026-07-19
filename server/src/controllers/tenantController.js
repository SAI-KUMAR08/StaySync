import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import {
  Room, Bed, Complaint, Payment, Notice, Tenant, BedShiftRequest, MealTiming, PaymentRequest,
} from "../models/index.js";
import { getSlaDueAt } from "../services/authService.js";
import {
  syncHostelPaymentStatuses,
  groupPaymentsByStatus,
  ensureTenantRentInvoices,
} from "../services/paymentService.js";
import { escapeRegex } from "../utils/regex.js";

const scope = (req) => ({
  ownerId: req.user.ownerId,
  hostelId: req.user.hostelId,
});

export const getDashboard = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id)
    .populate("roomId")
    .populate("bedId");
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
    Notice.find({ ...scope(req), isActive: true })
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
  const tenant = await Tenant.findById(req.user.id);
  if (tenant) await ensureTenantRentInvoices(tenant);

  const payments = await Payment.find({
    ...f,
    tenantId: req.user.id,
  }).sort({ year: -1, dueDate: -1 });

  const grouped = groupPaymentsByStatus(payments);
  const totalDue = [...grouped.overdue, ...grouped.unpaid].reduce(
    (sum, p) => sum + p.totalAmount,
    0
  );

  return success(res, {
    payments,
    grouped,
    totalDue,
    overdueCount: grouped.overdue.length,
    unpaidCount: grouped.unpaid.length,
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
  if (!tenant?.isActive) throw new AppError("Account is deactivated. Contact your hostel admin.", 403);
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
    io.to(`hostel_${req.user.hostelId}`).emit("complaint_created", populated);
  }

  return success(res, populated, 201);
});

export const listNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find({
    ...scope(req),
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
  }).sort({ createdAt: -1 });
  return success(res, notices);
});

export const requestBedShift = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.bedId) throw new AppError("No bed assigned", 400);

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
    requestedRoomId: req.validated.body.requestedRoomId,
    reason: req.validated.body.reason,
  });
  return success(res, request, 201);
});

export const listBedShiftRequests = asyncHandler(async (req, res) => {
  const requests = await BedShiftRequest.find({
    ...scope(req),
    tenantId: req.user.id,
  }).sort({ createdAt: -1 });
  return success(res, requests);
});

export const markNoticeRead = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant || !tenant.isActive) throw new AppError("Tenant not found", 404);

  const notice = await Notice.findOneAndUpdate(
    { _id: req.validated.params.id, ownerId: req.user.ownerId, hostelId: req.user.hostelId, isActive: true },
    { $addToSet: { readBy: req.user.id } },
    { new: true }
  );
  if (!notice) throw new AppError("Notice not found", 404);
  return success(res, notice);
});

// ── Meal Timings (tenant view-only) ────────────────────────

export const listMealTimings = asyncHandler(async (req, res) => {
  const { mealType } = req.query;
  const query = {
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    isActive: true,
  };
  if (mealType) query.mealType = mealType;
  const timings = await MealTiming.find(query).sort({ mealType: 1, dayOfWeek: 1 });
  return success(res, timings);
});

// ── Payment Requests (tenant) ──────────────────────────────

export const createPaymentRequest = asyncHandler(async (req, res) => {
  const { paymentMonth, year, amount, paymentProof, notes } = req.validated.body;
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant?.isActive) throw new AppError("Account is deactivated", 403);

  // Prevent duplicate pending requests for same period
  const existing = await PaymentRequest.findOne({
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
    paymentMonth,
    year,
    status: "pending",
  });
  if (existing) throw new AppError("You already have a pending payment request for this period", 409);

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

