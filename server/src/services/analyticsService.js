import mongoose from "mongoose";
import { Room, Bed, Complaint, Payment, Tenant } from "../models/index.js";
import { getOccupancySummary } from "./occupancyService.js";
import { countOverdueTenants, sumOutstandingByStatus } from "./paymentService.js";

function oid(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

export async function getDashboardStats(ownerId, hostelId) {
  const occupancy = await getOccupancySummary(ownerId, hostelId);

  const [activeComplaints, totalTenants, overdueTenants, dues, monthlyRevenue] =
    await Promise.all([
      Complaint.countDocuments({
        ownerId,
        hostelId,
        status: { $in: ["pending", "assigned", "in_progress"] },
      }),
      Tenant.countDocuments({ ownerId, hostelId, isActive: true }),
      countOverdueTenants(ownerId, hostelId),
      sumOutstandingByStatus(ownerId, hostelId),
      Payment.aggregate([
        {
          $match: {
            ownerId: oid(ownerId),
            hostelId: oid(hostelId),
            paymentStatus: "paid",
            year: new Date().getFullYear(),
            paymentMonth: new Date().toLocaleString("en-US", { month: "long" }),
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

  return {
    ...occupancy,
    vacantBeds: occupancy.availableBeds,
    totalTenants,
    activeComplaints,
    overdueTenants,
    overduePayments: dues.overdueCount,
    unpaidPayments: dues.unpaidCount,
    overdueAmount: dues.overdueAmount,
    unpaidAmount: dues.unpaidAmount,
    pendingPayments: dues.unpaidAmount + dues.overdueAmount,
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
