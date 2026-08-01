import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import * as analyticsService from "../../services/analyticsService.js";
import { syncPaymentStatusesOnly } from "../../services/paymentService.js";
import { getEnglishMonthName } from "../../utils/date.js";
import { ownerFilter } from "../../utils/scope.js";

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
  const [stats, occupancy, payments, complaints] = await Promise.all([
    analyticsService.getDashboardStats(resolvedOwnerId, f.hostelId),
    analyticsService.getOccupancyAnalytics(resolvedOwnerId, f.hostelId),
    analyticsService.getPaymentAnalytics(resolvedOwnerId, f.hostelId),
    analyticsService.getComplaintTrends(resolvedOwnerId, f.hostelId),
  ]);

  return success(res, { stats, charts: { occupancy, payments, complaints } });
});

export const getHostelsSummary = asyncHandler(async (req, res) => {
  const resolvedOwnerId = req.user.id;
  const rows = await analyticsService.getHostelsSummary(resolvedOwnerId);
  return success(res, rows);
});

export const getFinancialOverview = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const resolvedOwnerId = f.ownerId;

  // Find all hostels for this owner
  const hostels = await mongoose
    .model("Hostel")
    .find({ ownerId: resolvedOwnerId, isActive: true })
    .select("_id name");
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

  const now = new Date();
  const currentTotal = now.getFullYear() * 12 + now.getMonth();
  const candidates = [];
  for (let back = 0; back <= 6; back++) {
    const t = currentTotal - back;
    candidates.push({
      yy: Math.floor(t / 12),
      mm: t % 12, // 0-based month
      monthName: getEnglishMonthName(new Date(Math.floor(t / 12), t % 12, 1)),
    });
  }

  const probes = await Promise.all(
    candidates.map((c) => {
      const start = new Date(c.yy, c.mm, 1);
      const end = new Date(c.yy, c.mm + 1, 1);
      return Promise.all([
        mongoose.model("Payment").exists({
          ownerId: resolvedOwnerId,
          paymentStatus: "paid",
          $or: [{ year: c.yy, paymentMonth: c.monthName }, { paidDate: { $gte: start, $lt: end } }],
        }),
        mongoose.model("Expense").exists({
          ownerId: resolvedOwnerId,
          date: { $gte: start, $lt: end },
        }),
      ]);
    })
  );

  const eff = candidates.find((_, i) => probes[i][0] || probes[i][1]) || candidates[0];
  const effYear = eff.yy;
  const effMonthIdx = eff.mm;
  const effMonthName = eff.monthName;

  const startOfEffMonth = new Date(effYear, effMonthIdx, 1);
  const endOfEffMonth = new Date(effYear, effMonthIdx + 1, 1);

  // Total income - all paid payments across ALL hostels for the effective month.
  const incomeAgg = await mongoose.model("Payment").aggregate([
    {
      $match: {
        ownerId: toObjectId(resolvedOwnerId),
        paymentStatus: "paid",
        $or: [
          { year: effYear, paymentMonth: effMonthName },
          { paidDate: { $gte: startOfEffMonth, $lt: endOfEffMonth } },
        ],
      },
    },
    { $group: { _id: "$hostelId", total: { $sum: "$totalAmount" } } },
  ]);

  // Total expenses - all expenses across ALL hostels (effective month)
  const expenseAgg = await mongoose.model("Expense").aggregate([
    {
      $match: {
        ownerId: toObjectId(resolvedOwnerId),
        date: {
          $gte: startOfEffMonth,
          $lt: endOfEffMonth,
        },
      },
    },
    { $group: { _id: "$hostelId", total: { $sum: "$amount" } } },
  ]);

  const totalIncome = incomeAgg.reduce((sum, h) => sum + (h.total || 0), 0);
  const totalExpenses = expenseAgg.reduce((sum, h) => sum + (h.total || 0), 0);

  // Per-hostel breakdown
  const hostelData = hostels.map((h) => ({
    name: h.name,
    income: incomeAgg.find((i) => i._id && String(i._id) === String(h._id))?.total || 0,
    expenses: expenseAgg.find((e) => e._id && String(e._id) === String(h._id))?.total || 0,
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
