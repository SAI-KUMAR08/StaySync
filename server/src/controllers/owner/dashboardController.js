import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import * as analyticsService from "../../services/analyticsService.js";
import { syncPaymentStatusesOnly } from "../../services/paymentService.js";
import { getEnglishMonthName } from "../../utils/date.js";
import { ownerFilter, toObjectId } from "../../utils/scope.js";

export const getOccupancy = asyncHandler(async (req, res) => {
  // Support per-hostel occupancy via x-hostel-id header (used by HostelSwitcher dropdown)
  const requestedHostelId = req.headers["x-hostel-id"];
  const hostelId = requestedHostelId || req.user.hostelId;
  // Security: verify this hostel belongs to the owner when a different hostel is requested
  if (requestedHostelId && requestedHostelId !== req.user.hostelId) {
    const hostel = await mongoose.model("Hostel").findOne({
      _id: requestedHostelId,
      ownerId: req.user.id,
      isActive: true,
    });
    if (!hostel) throw new AppError("Hostel not found", 404);
  }
  const occupancy = await analyticsService.getOccupancyAnalytics(req.user.id, hostelId);
  return success(res, occupancy);
});

export const getDashboard = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const resolvedOwnerId = req.user.id;

  // Fire payment status sync in background — don't block dashboard render
  syncPaymentStatusesOnly(resolvedOwnerId, f.hostelId).catch(() => {});

  // Only fetch stats — the frontend ignores chart data entirely
  const stats = await analyticsService.getDashboardStats(resolvedOwnerId, f.hostelId);

  return success(res, { stats });
});

export const getHostelsSummary = asyncHandler(async (req, res) => {
  const resolvedOwnerId = req.user.id;
  const rows = await analyticsService.getHostelsSummary(resolvedOwnerId);
  return success(res, rows);
});

export const getFinancialOverview = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const resolvedOwnerId = f.ownerId;

  const hostels = await mongoose
    .model("Hostel")
    .find({ ownerId: resolvedOwnerId, isActive: true })
    .select("_id name")
    .lean();
  const hostelIds = hostels.map((h) => h._id);

  if (hostelIds.length === 0) {
    return success(res, {
      totalIncome: 0,
      totalExpenses: 0,
      net: 0,
      hostelCount: 0,
      hostels: [],
      month: getEnglishMonthName(),
      year: new Date().getFullYear(),
    });
  }

  // Cover last 6 months in one query each instead of 6 probe round-trips
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Build list of last 6 months metadata
  const candidates = [];
  for (let back = 0; back <= 5; back++) {
    const t = now.getFullYear() * 12 + now.getMonth() - back;
    const yy = Math.floor(t / 12);
    const mm = t % 12;
    candidates.push({ yy, mm, monthName: getEnglishMonthName(new Date(yy, mm, 1)) });
  }

  const oId = toObjectId(resolvedOwnerId);

  // Single aggregation each for payments and expenses over last 6 months
  const [paymentData, expenseData] = await Promise.all([
    mongoose.model("Payment").aggregate([
      {
        $match: {
          ownerId: oId,
          paymentStatus: "paid",
          paidDate: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            hostelId: "$hostelId",
            year: { $year: "$paidDate" },
            month: { $month: "$paidDate" }, // 1-based
          },
          total: { $sum: "$totalAmount" },
        },
      },
    ]),
    mongoose.model("Expense").aggregate([
      {
        $match: {
          ownerId: oId,
          date: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            hostelId: "$hostelId",
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  // Find most recent month that has any data
  const effCandidate =
    candidates.find((c) => {
      const hasPayment = paymentData.some((p) => p._id.year === c.yy && p._id.month === c.mm + 1);
      const hasExpense = expenseData.some((e) => e._id.year === c.yy && e._id.month === c.mm + 1);
      return hasPayment || hasExpense;
    }) || candidates[0];

  const effYear = effCandidate.yy;
  const effMonthOneBased = effCandidate.mm + 1;
  const effMonthName = effCandidate.monthName;

  // Sum up totals for effective month
  const incomeByHostel = {};
  paymentData
    .filter((p) => p._id.year === effYear && p._id.month === effMonthOneBased)
    .forEach((p) => {
      const key = String(p._id.hostelId);
      incomeByHostel[key] = (incomeByHostel[key] || 0) + p.total;
    });

  const expenseByHostel = {};
  expenseData
    .filter((e) => e._id.year === effYear && e._id.month === effMonthOneBased)
    .forEach((e) => {
      const key = String(e._id.hostelId);
      expenseByHostel[key] = (expenseByHostel[key] || 0) + e.total;
    });

  const totalIncome = Object.values(incomeByHostel).reduce((s, v) => s + v, 0);
  const totalExpenses = Object.values(expenseByHostel).reduce((s, v) => s + v, 0);

  const hostelData = hostels.map((h) => ({
    name: h.name,
    income: incomeByHostel[String(h._id)] || 0,
    expenses: expenseByHostel[String(h._id)] || 0,
  }));

  return success(res, {
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    hostelCount: hostelIds.length,
    hostels: hostelData,
    month: effMonthName,
    year: effYear,
  });
});

export const getPendingCounts = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const baseMatch = { ownerId: toObjectId(f.ownerId) };
  if (f.hostelId) baseMatch.hostelId = toObjectId(f.hostelId);

  const [profile, payment, bedShift, vacate] = await Promise.all([
    mongoose.model("ProfileUpdateRequest").countDocuments({ ...baseMatch, status: "pending" }),
    mongoose.model("PaymentRequest").countDocuments({ ...baseMatch, status: "pending" }),
    mongoose.model("BedShiftRequest").countDocuments({ ...baseMatch, status: "pending" }),
    mongoose.model("VacateRequest").countDocuments({ ...baseMatch, status: "pending" }),
  ]);

  return success(res, { profile, payment, bedShift, vacate });
});
