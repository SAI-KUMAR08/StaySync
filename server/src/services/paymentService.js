import mongoose from "mongoose";
import { Payment, Tenant } from "../models/index.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthIndex(monthName) {
  return MONTHS.indexOf(monthName);
}

/** Rent due on the same calendar day each month after join (capped at last day of shorter months) */
export function getBillingPeriodsFromJoin(joinDate, until = new Date()) {
  const periods = [];
  const join = new Date(joinDate);
  const dueDay = join.getDate();

  let year = join.getFullYear();
  let month = join.getMonth() + 1;

  // Limit lookback to prevent runaway loops
  const maxMonths = 36;
  let count = 0;

  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate());

  while (count < maxMonths) {
    const maxDays = new Date(year, month + 1, 0).getDate();
    const currentDueDay = Math.min(dueDay, maxDays);
    const cursor = new Date(year, month - 1, currentDueDay);

    if (cursor > end) break;

    periods.push({
      month: MONTHS[cursor.getMonth()],
      year: cursor.getFullYear(),
      dueDate: new Date(cursor),
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    count++;
  }
  return periods;
}

/** pending until due date; overdue after due date passes */
export function derivePaymentStatus(payment, now = new Date()) {
  const currentStatus = payment?.paymentStatus ?? payment?.status;
  if (currentStatus === "paid") return "paid";

  const due = payment?.dueDate ? new Date(payment.dueDate) : null;
  if (!due) return "unpaid";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < today) return "overdue";
  return "unpaid";
}

/**
 * Batch-ensure rent invoices for a single tenant.
 * Uses a single aggregate query + bulkWrite instead of per-period loops + saves.
 */
export async function ensureTenantRentInvoices(tenant, session = null) {
  if (!tenant?.monthlyRent || tenant.monthlyRent <= 0) return [];

  const joinDate = new Date(tenant.joinDate || tenant.createdAt);
  const periods = getBillingPeriodsFromJoin(joinDate);
  const opts = session ? { session } : {};

  // Single query: find all existing payments for this tenant
  const existingDocs = await Payment.find(
    { tenantId: tenant._id },
    { paymentMonth: 1, year: 1, _id: 0 }
  ).lean().session(session || null).then(rows => new Set(rows.map(r => `${r.paymentMonth}|${r.year}`)));

  // Gather missing draft payments
  const drafts = periods
    .filter(p => !existingDocs.has(`${p.month}|${p.year}`))
    .map(p => ({
      ownerId: tenant.ownerId,
      hostelId: tenant.hostelId,
      tenantId: tenant._id,
      amount: tenant.monthlyRent,
      fineAmount: 0,
      totalAmount: tenant.monthlyRent,
      paymentMonth: p.month,
      year: p.year,
      dueDate: p.dueDate,
      paymentStatus: derivePaymentStatus({ dueDate: p.dueDate, paymentStatus: "unpaid" }),
      notes: `Rent for ${p.month} ${p.year}`,
    }));

  if (drafts.length > 0) {
    await Payment.insertMany(drafts, opts);
  }

  // Bulk-update overdue/unpaid statuses
  const openPayments = await Payment.find({
    tenantId: tenant._id,
    paymentStatus: { $ne: "paid" },
  }).lean().session(session || null);

  const bulkOps = [];
  for (const payment of openPayments) {
    const next = derivePaymentStatus(payment);
    if (payment.paymentStatus !== next) {
      bulkOps.push({
        updateOne: {
          filter: { _id: payment._id },
          update: { $set: { paymentStatus: next } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await Payment.bulkWrite(bulkOps, opts);
  }

  return drafts;
}

/**
 * Lightweight status sync — only refreshes payment statuses, skips invoice creation.
 * Use this for dashboard loads where you just need fresh statuses, not new invoices.
 */
export async function syncPaymentStatusesOnly(ownerId, hostelId) {
  const payments = await Payment.find({
    ownerId,
    hostelId,
    paymentStatus: { $ne: "paid" },
  }).lean();

  const bulkOps = [];
  for (const payment of payments) {
    const next = derivePaymentStatus(payment);
    if (payment.paymentStatus !== next) {
      bulkOps.push({
        updateOne: {
          filter: { _id: payment._id },
          update: { $set: { paymentStatus: next } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await Payment.bulkWrite(bulkOps);
  }
  return bulkOps.length;
}

/**
 * Full sync: creates missing invoices + refreshes payment statuses.
 * Only call this from the payments page or cron, not from the dashboard.
 */
export async function syncHostelPaymentStatuses(ownerId, hostelId) {
  // Batch-create invoices per hostel using aggregation
  const activeTenants = await Tenant.find(
    { ownerId, hostelId, isActive: true, monthlyRent: { $gt: 0 } },
    { _id: 1, ownerId: 1, hostelId: 1, monthlyRent: 1, joinDate: 1, createdAt: 1 }
  ).lean();

  await Promise.all(
    activeTenants.map(t => ensureTenantRentInvoices(t))
  );

  // Bulk-update statuses
  return syncPaymentStatusesOnly(ownerId, hostelId);
}

export async function ensureHostelRentInvoices(ownerId, hostelId) {
  const tenants = await Tenant.find(
    { ownerId, hostelId, isActive: true, monthlyRent: { $gt: 0 } },
    { _id: 1, ownerId: 1, hostelId: 1, monthlyRent: 1, joinDate: 1, createdAt: 1 }
  ).lean();

  await Promise.all(
    tenants.map(t => ensureTenantRentInvoices(t))
  );
}

export async function countOverdueTenants(ownerId, hostelId) {
  return Payment.distinct("tenantId", {
    ownerId,
    hostelId,
    paymentStatus: "overdue",
  }).then((ids) => ids.length);
}

export async function sumOutstandingByStatus(ownerId, hostelId) {
  const oId = ownerId && mongoose.isValidObjectId(ownerId) ? new mongoose.Types.ObjectId(ownerId) : null;
  const hId = hostelId && mongoose.isValidObjectId(hostelId) ? new mongoose.Types.ObjectId(hostelId) : null;
  const rows = await Payment.aggregate([
    {
      $match: {
        ownerId: oId,
        hostelId: hId,
        paymentStatus: { $in: ["unpaid", "overdue"] },
      },
    },
    {
      $group: {
        _id: "$paymentStatus",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" },
      },
    },
  ]);

  const map = Object.fromEntries(rows.map((r) => [r._id, r]));
  return {
    unpaidCount: map.unpaid?.count ?? 0,
    unpaidAmount: map.unpaid?.amount ?? 0,
    overdueCount: map.overdue?.count ?? 0,
    overdueAmount: map.overdue?.amount ?? 0,
  };
}

export function groupPaymentsByStatus(payments) {
  const overdue = [];
  const unpaid = [];
  const paid = [];

  for (const p of payments) {
    const s = p?.paymentStatus ?? p?.status;
    if (s === "paid") paid.push(p);
    else if (s === "overdue") overdue.push(p);
    else unpaid.push(p);
  }

  const byMonth = (a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return monthIndex(b.paymentMonth || b.month) - monthIndex(a.paymentMonth || a.month);
  };

  overdue.sort(byMonth);
  unpaid.sort(byMonth);
  paid.sort(byMonth);

  return { overdue, unpaid, paid };
}

export function getCurrentMonthYear() {
  const now = new Date();
  return {
    month: now.toLocaleString("en-US", { month: "long" }),
    year: now.getFullYear(),
  };
}
