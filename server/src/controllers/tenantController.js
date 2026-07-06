import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import {
  Room, Bed, Complaint, Payment, Notice, Tenant, BedShiftRequest,
} from "../models/index.js";
import { getSlaDueAt } from "../services/authService.js";
import {
  syncHostelPaymentStatuses,
  groupPaymentsByStatus,
  ensureTenantRentInvoices,
} from "../services/paymentService.js";
import { escapeRegex } from "../utils/regex.js";
import Razorpay from "razorpay";
import crypto from "crypto";

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new AppError("Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server .env file.", 400);
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}


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
    .populate("tenantId", "name email phone roomId")
    .populate("roomId", "roomNumber")
    .sort({ createdAt: -1 });
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
    .populate("tenantId", "name email phone roomId")
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

export const createPaymentOrder = asyncHandler(async (req, res) => {
  const { paymentId } = req.body;
  const payment = await Payment.findOne({ _id: paymentId, tenantId: req.user.id });
  
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status === "paid") throw new AppError("Payment already completed", 400);

  const amountInPaise = Math.round(payment.totalAmount * 100);
  
  const options = {
    amount: amountInPaise,
    currency: "INR",
    receipt: `receipt_${payment._id}`,
  };

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    if (process.env.NODE_ENV !== "production") {
      const order = {
        id: `order_mock_${crypto.randomBytes(8).toString("hex")}`,
        amount: amountInPaise,
        currency: "INR",
        receipt: `receipt_${payment._id}`,
        notes: { mock: true },
      };
      return success(res, { order, mock: true });
    }
    throw new AppError("Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server .env file.", 400);
  }

  try {
    const order = await getRazorpay().orders.create(options);
    return success(res, { order });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    throw new AppError("Failed to create Razorpay order. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.", 500);
  }
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, paymentId } = req.body;

  const payment = await Payment.findOne({ _id: paymentId, tenantId: req.user.id });
  if (!payment) throw new AppError("Payment not found", 404);

  // Idempotency guard: already paid — return success without reprocessing
  if (payment.paymentStatus === "paid") {
    return success(res, payment);
  }

  if (razorpay_order_id?.startsWith("order_mock_")) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("Mock payments not allowed in production", 400);
    }
    const tenant = await Tenant.findById(req.user.id);
    if (tenant && tenant.bedId) {
      payment.bedId = tenant.bedId;
    }

    payment.status = "paid";
    payment.paidDate = new Date();
    payment.paymentMethod = "upi";
    payment.receiptNumber = razorpay_payment_id || `pay_mock_${crypto.randomBytes(8).toString("hex")}`;
    
    payment.razorpay_order_id = razorpay_order_id;
    payment.razorpay_payment_id = razorpay_payment_id || `pay_mock_${crypto.randomBytes(8).toString("hex")}`;
    payment.razorpay_signature = razorpay_signature || "mock_signature";

    await payment.save();

    const io = req.app.get("io");
    if (io && payment.hostelId) {
      io.to(`hostel_${payment.hostelId}`).emit("payment_completed", { message: `Payment of ₹${payment.totalAmount} received (Mock).` });
    }

    return success(res, payment);
  }

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    throw new AppError("Payment verification failed", 400);
  }

  // Populate bedId from tenant details if not present
  const tenant = await Tenant.findById(req.user.id);
  if (tenant && tenant.bedId) {
    payment.bedId = tenant.bedId;
  }

  payment.status = "paid";
  payment.paidDate = new Date();
  payment.paymentMethod = "upi";
  payment.receiptNumber = razorpay_payment_id;
  
  // Save Razorpay fields on Payment
  payment.razorpay_order_id = razorpay_order_id;
  payment.razorpay_payment_id = razorpay_payment_id;
  payment.razorpay_signature = razorpay_signature;

  await payment.save();

  const io = req.app.get("io");
  if (io && payment.hostelId) {
    io.to(`hostel_${payment.hostelId}`).emit("payment_completed", { message: `Payment of ₹${payment.totalAmount} received.` });
  }

  return success(res, payment);
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

