import mongoose from "mongoose";
import { Room, Bed, Complaint, Payment, Tenant, Expense, Hostel } from "../models/index.js";
import { getOccupancySummary } from "./occupancyService.js";
import { countOverdueTenants, sumOutstandingByStatus } from "./paymentService.js";

function oid(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

export async function getDashboardStats(ownerId, hostelId) {
  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();

  // Calculate previous month end for trend comparison
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [occupancy, activeComplaints, totalTenants, previousTotalTenants, overdueTenants, dues, monthlyRevenue] =
    await Promise.all([
      getOccupancySummary(ownerId, hostelId),
      Complaint.countDocuments({
        ownerId,
        hostelId,
        status: { $in: ["pending", "assigned", "in_progress"] },
      }),
      Tenant.countDocuments({ ownerId, hostelId, isActive: true }),
      // Active tenants 1 month ago — approximate by subtracting tenants created after last month
      Tenant.countDocuments({
        ownerId,
        hostelId,
        isActive: true,
        createdAt: { $lte: prevMonthEnd },
      }),
      countOverdueTenants(ownerId, hostelId),
      sumOutstandingByStatus(ownerId, hostelId),
      Payment.aggregate([
        {
          $match: {
            ownerId: oid(ownerId),
            hostelId: oid(hostelId),
            paymentStatus: "paid",
            year: currentYear,
            paymentMonth: currentMonth,
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

  return {
    ...occupancy,
    vacantBeds: occupancy.availableBeds,
    totalTenants,
    previousTotalTenants,
    activeComplaints,
    overdueTenants,
    overduePayments: dues.overdueCount,
    unpaidPayments: dues.unpaidCount,
    overdueAmount: dues.overdueAmount,
    unpaidAmount: dues.unpaidAmount,
    monthlyRevenue: monthlyRevenue[0]?.total ?? 0,
  };
}

export async function getOccupancyAnalytics(ownerId, hostelId) {
  const rooms = await Room.find({ ownerId, hostelId, isActive: true });
  return rooms.map((r) => ({
    room: r.roomNumber,
    occupied: r.occupiedBeds,
    available: r.availableBeds,
    capacity: r.capacity,
    rate: r.capacity ? Math.round((r.occupiedBeds / r.capacity) * 100) : 0,
  }));
}

export async function getPaymentAnalytics(ownerId, hostelId) {
  const year = new Date().getFullYear();
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const data = await Payment.aggregate([
    { $match: { ownerId: oid(ownerId), hostelId: oid(hostelId), year } },
    {
      $group: {
        _id: "$paymentMonth",
        collected: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0] },
        },
        pending: {
          $sum: { $cond: [{ $ne: ["$paymentStatus", "paid"] }, "$totalAmount", 0] },
        },
      },
    },
  ]);

  const map = Object.fromEntries(data.map((d) => [d._id, d]));
  return months.map((month) => ({
    month: month.slice(0, 3),
    collected: map[month]?.collected ?? 0,
    pending: map[month]?.pending ?? 0,
  }));
}

export async function getComplaintTrends(ownerId, hostelId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return Complaint.aggregate([
    { $match: { ownerId: oid(ownerId), hostelId: oid(hostelId), createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: "$_id", count: 1, _id: 0 } },
  ]);
}

export async function getHostelsSummary(ownerId) {
  const hostels = await Hostel.find({ ownerId, isActive: true }).select("_id name").lean();
  if (!hostels.length) return [];

  const currentMonth = new Date().toLocaleString("en-US", { month: "long" });
  const currentYear = new Date().getFullYear();

  const rows = await Promise.all(
    hostels.map(async (h) => {
      const [occupancy, tenantCount, monthlyRevenue, expenseAgg, dues] = await Promise.all([
        getOccupancySummary(ownerId, h._id),
        Tenant.countDocuments({ ownerId, hostelId: h._id, isActive: true }),
        Payment.aggregate([
          {
            $match: {
              ownerId: oid(ownerId),
              hostelId: oid(h._id),
              paymentStatus: "paid",
              year: currentYear,
              paymentMonth: currentMonth,
            },
          },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Expense.aggregate([
          {
            $match: {
              ownerId,
              hostelId: h._id,
              date: {
                $gte: new Date(currentYear, new Date().getMonth(), 1),
                $lt: new Date(currentYear, new Date().getMonth() + 1, 1),
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        sumOutstandingByStatus(ownerId, h._id),
      ]);

      return {
        _id: h._id,
        name: h.name,
        activeResidents: tenantCount,
        totalBeds: occupancy.totalBeds,
        occupiedBeds: occupancy.occupiedBeds,
        availableBeds: occupancy.availableBeds,
        occupancyRate: occupancy.occupancyPercentage,
        monthlyIncome: monthlyRevenue[0]?.total ?? 0,
        monthlyExpenses: expenseAgg[0]?.total ?? 0,
        unpaidCount: dues.unpaidCount,
        unpaidAmount: dues.unpaidAmount,
        overdueCount: dues.overdueCount,
        overdueAmount: dues.overdueAmount,
      };
    })
  );

  return rows;
}
