import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import { emitToHostel } from "../../utils/socketEvents.js";
import { Payment, Tenant, PaymentRequest } from "../../models/index.js";
import { ownerFilter } from "../../utils/scope.js";
import { syncPaymentStatusesOnly } from "../../services/paymentService.js";
import { createTenantNotification } from "../../services/notificationService.js";
import { escapeRegex } from "../../utils/regex.js";
import { getEnglishMonthName } from "../../utils/date.js";

export const listPayments = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  await syncPaymentStatusesOnly(f.ownerId, f.hostelId);

  const query = { ...f };
  const { status, search } = req.query;

  if (status) query.paymentStatus = status;

  if (search?.trim()) {
    // Check if search term is a valid MongoDB ObjectId (24 hex chars)
    const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);
    if (isValidObjectId(search.trim())) {
      query.tenantId = new mongoose.Types.ObjectId(search.trim());
    } else {
      const safeSearch = escapeRegex(search.trim());
      const tenants = await Tenant.find({
        ...ownerFilter(req),
        "personalInfo.name": { $regex: safeSearch, $options: "i" },
      }).select("_id");
      if (tenants.length) {
        query.tenantId = { $in: tenants.map((t) => t._id) };
      } else {
        return success(res, []);
      }
    }
  }

  const payments = await Payment.find(query)
    .populate({
      path: "tenantId",
      select:
        "personalInfo.name personalInfo.email personalInfo.phone monthlyRent roomId floorId bedId",
      populate: [
        { path: "roomId", select: "roomNumber" },
        { path: "floorId", select: "floorName floorNumber" },
        { path: "bedId", select: "bedNumber" },
      ],
    })
    .sort({ dueDate: -1 })
    .limit(200);
  return success(res, payments);
});

export const createPayment = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { tenantId, amount, fineAmount, paymentMonth, month, year, dueDate, notes } =
    req.validated.body;
  const tenant = await Tenant.findOne({ _id: tenantId, ...f, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const effectivePaymentMonth = paymentMonth || month;
  const totalAmount = amount + (fineAmount ?? 0);

  // Guard against colliding with the unique (tenantId, paymentMonth, year,
  // paymentType) invoice index — return a clean 409 instead of a 11000 error.
  const existing = await Payment.findOne({
    tenantId,
    paymentMonth: effectivePaymentMonth,
    year,
    paymentType: "rent",
  });
  if (existing) throw new AppError("An invoice already exists for this period", 409);

  const payment = await Payment.create({
    ...f,
    tenantId,
    amount,
    fineAmount: fineAmount ?? 0,
    totalAmount,
    paymentMonth: effectivePaymentMonth,
    year,
    dueDate,
    notes,
    paymentStatus: "unpaid",
  });
  emitToHostel(req, "payment_completed", {
    hostelId: req.user?.hostelId,
    action: "created",
    paymentId: payment._id,
    message: `New payment of ₹${totalAmount} created`,
  });
  return success(res, payment, 201);
});

export const updatePayment = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const payment = await Payment.findOne({ _id: req.validated.params.id, ...f });
  if (!payment) throw new AppError("Payment not found", 404);

  const updates = req.validated.body;
  const effectiveStatus = updates.paymentStatus || updates.status;
  if (effectiveStatus === "paid" && !updates.paymentMethod) {
    updates.paymentMethod = "cash";
  }
  if (effectiveStatus === "paid" && !updates.paidDate) {
    updates.paidDate = new Date();
  }
  if (updates.paymentStatus === undefined && updates.status) {
    updates.paymentStatus = updates.status;
  }
  delete updates.status;

  payment.set(updates);
  // Keep totalAmount in sync whenever the amount or the fine changes — an
  // amount-only update previously left totalAmount stale (amount ≠ total).
  if (updates.amount !== undefined || updates.fineAmount !== undefined) {
    payment.totalAmount = (payment.amount || 0) + (payment.fineAmount || 0);
  }
  await payment.save();

  const updated = await Payment.findById(payment._id).populate({
    path: "tenantId",
    select:
      "personalInfo.name personalInfo.email personalInfo.phone monthlyRent roomId floorId bedId",
    populate: [
      { path: "roomId", select: "roomNumber" },
      { path: "floorId", select: "floorName floorNumber" },
      { path: "bedId", select: "bedNumber" },
    ],
  });
  emitToHostel(req, "payment_completed", {
    hostelId: req.user?.hostelId,
    action: "updated",
    paymentId: payment._id,
    status: effectiveStatus,
    message: `Payment ${effectiveStatus}`,
  });
  return success(res, updated);
});

export const getPaymentTotals = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const resolvedOwnerId = req.user.id;
  const hostelId = f.hostelId;
  const ownerId = resolvedOwnerId;

  const currentMonth = getEnglishMonthName();
  const currentYear = new Date().getFullYear();

  // Single aggregation for all payment stats. Hint the additive
  // {ownerId, hostelId, paymentType, paymentStatus} index (declared on the
  // Payment schema) so the $ne: deposit match seeks the range instead of
  // scanning every payment ever recorded for the hostel.
  const oId = new mongoose.Types.ObjectId(ownerId);
  const hId =
    hostelId && mongoose.isValidObjectId(hostelId) ? new mongoose.Types.ObjectId(hostelId) : null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const matchQuery = { ownerId: oId };
  if (hId) matchQuery.hostelId = hId;

  const [totals] = await Payment.aggregate([
    {
      $match: matchQuery,
    },
    {
      $group: {
        _id: null,
        totalCollected: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$paymentStatus", "paid"] },
                  {
                    $or: [
                      {
                        $and: [
                          { $eq: ["$paymentMonth", currentMonth] },
                          { $eq: ["$year", currentYear] },
                        ],
                      },
                      {
                        $and: [
                          { $gte: ["$paidDate", startOfMonth] },
                          { $lt: ["$paidDate", endOfMonth] },
                        ],
                      },
                    ],
                  },
                ],
              },
              "$totalAmount",
              0,
            ],
          },
        },
        totalPending: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, "$totalAmount", 0],
          },
        },
        totalOverdue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "overdue"] }, "$totalAmount", 0],
          },
        },
        paidCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$paymentStatus", "paid"] },
                  { $eq: ["$paymentMonth", currentMonth] },
                  { $eq: ["$year", currentYear] },
                ],
              },
              1,
              0,
            ],
          },
        },
        unpaidCount: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0],
          },
        },
        overdueCount: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "overdue"] }, 1, 0],
          },
        },
      },
    },
  ]).option({ hint: { ownerId: 1, hostelId: 1, paymentType: 1, paymentStatus: 1 } });

  const result = {
    totalCollected: totals?.totalCollected || 0,
    totalPending: totals?.totalPending || 0,
    totalOverdue: totals?.totalOverdue || 0,
    paidCount: totals?.paidCount || 0,
    unpaidCount: totals?.unpaidCount || 0,
    overdueCount: totals?.overdueCount || 0,
  };

  // Calculate collection rate: totalCollected / (totalCollected + totalPending + totalOverdue) * 100
  const totalBilled = result.totalCollected + result.totalPending + result.totalOverdue;
  result.collectionRate =
    totalBilled > 0 ? Math.round((result.totalCollected / totalBilled) * 100) : 0;

  return success(res, result);
});

// ── Payment Requests (owner review) ────────────────────────

export const listPaymentRequests = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status } = req.query;
  const query = { ...f };
  if (status) query.status = status;

  const requests = await PaymentRequest.find(query)
    .populate(
      "tenantId",
      "personalInfo.name personalInfo.email personalInfo.phone monthlyRent roomId"
    )
    .populate("reviewedBy", "name")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const reviewPaymentRequest = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status, reviewNotes } = req.validated.body;
  const request = await PaymentRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Payment request not found", 404);
  if (request.status !== "pending") throw new AppError("Payment request already reviewed", 400);

  if (status === "approved") {
    // Reuse an existing invoice for this tenant-period instead of colliding with
    // the unique (tenantId, paymentMonth, year, paymentType) index.
    let payment = await Payment.findOne({
      tenantId: request.tenantId,
      paymentMonth: request.paymentMonth,
      year: request.year,
      paymentType: "rent",
    });

    if (payment) {
      payment.paymentStatus = "paid";
      payment.paidDate = new Date();
      payment.paymentMethod = "upi";
      payment.receiptNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await payment.save();
    } else {
      // Create actual payment record
      payment = await Payment.create({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: request.tenantId,
        amount: request.amount,
        fineAmount: 0,
        totalAmount: request.amount,
        paymentMonth: request.paymentMonth,
        year: request.year,
        dueDate: new Date(),
        paidDate: new Date(),
        paymentStatus: "paid",
        paymentMethod: "upi",
        receiptNumber: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        notes:
          request.notes || `Payment request approved for ${request.paymentMonth} ${request.year}`,
      });
    }

    request.paymentId = payment._id;
    request.status = "approved";
    request.reviewedBy = req.user.id;
    request.reviewDate = new Date();
    request.reviewNotes = reviewNotes || "";
    await request.save();

    const io = req.app.get("io");
    if (io && f.hostelId) {
      io.to(`hostel_${f.hostelId}`).emit("payment_completed", {
        message: `Payment of ₹${payment.totalAmount} approved from request.`,
      });
    }

    // Durable inbox entry for the tenant.
    createTenantNotification({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: request.tenantId,
      type: "payment",
      title: "Payment request approved",
      message: `Your payment of ₹${payment.totalAmount} for ${request.paymentMonth} ${request.year} was approved.`,
      io,
    }).catch(() => {});

    return success(res, { request, payment });
  }

  // Rejected
  request.status = "rejected";
  request.reviewedBy = req.user.id;
  request.reviewDate = new Date();
  request.reviewNotes = reviewNotes || "";
  await request.save();

  // Durable inbox entry for the tenant.
  createTenantNotification({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    tenantId: request.tenantId,
    type: "payment",
    title: "Payment request rejected",
    message: `Your payment request for ${request.paymentMonth} ${request.year} was rejected.${request.reviewNotes ? ` Reason: ${request.reviewNotes}` : ""}`,
    io: req.app.get("io"),
  }).catch(() => {});

  return success(res, request);
});
