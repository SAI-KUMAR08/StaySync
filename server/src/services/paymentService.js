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

  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate());

  while (true) {
    const maxDays = new Date(year, month + 1, 0).getDate();
    const currentDueDay = Math.min(dueDay, maxDays);
    const cursor = new Date(year, month, currentDueDay);

    if (cursor > end) break;

    periods.push({
      month: MONTHS[cursor.getMonth()],
      year: cursor.getFullYear(),
      dueDate: new Date(cursor),
    });

    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
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

export async function ensureTenantRentInvoices(tenant, session = null) {
  if (!tenant?.monthlyRent || tenant.monthlyRent <= 0) return [];

  const joinDate = new Date(tenant.joinDate || tenant.createdAt);
  const periods = getBillingPeriodsFromJoin(joinDate);
  const created = [];
  const opts = session ? { session } : {};

  for (const period of periods) {
    const exists = await Payment.findOne({
      tenantId: tenant._id,
      paymentMonth: period.month,
      year: period.year,
    }).session(session || null);

    if (exists) continue;

    const draft = {
      ownerId: tenant.ownerId,
      hostelId: tenant.hostelId,
      tenantId: tenant._id,
      amount: tenant.monthlyRent,
      fineAmount: 0,
      totalAmount: tenant.monthlyRent,
      paymentMonth: period.month,
      year: period.year,
      dueDate: period.dueDate,
      notes: `Rent for ${period.month} ${period.year}`,
    };
    draft.paymentStatus = derivePaymentStatus({ ...draft, paymentStatus: "unpaid" });

    const [payment] = await Payment.create([draft], opts);
    created.push(payment);
  }

  const open = await Payment.find({
    tenantId: tenant._id,
    paymentStatus: { $ne: "paid" },
  }).session(session || null);

  for (const payment of open) {
    const next = derivePaymentStatus(payment);
    if (payment.paymentStatus !== next) {
      payment.paymentStatus = next;
      await payment.save(opts);
    }
  }

  return created;
}

export async function ensureHostelRentInvoices(ownerId, hostelId) {
  const tenants = await Tenant.find({ ownerId, hostelId, isActive: true });
  for (const tenant of tenants) {
    await ensureTenantRentInvoices(tenant);
  }
}

export async function syncHostelPaymentStatuses(ownerId, hostelId) {
  await ensureHostelRentInvoices(ownerId, hostelId);

  const payments = await Payment.find({
    ownerId,
    hostelId,
    paymentStatus: { $ne: "paid" },
  });

  let updated = 0;
  for (const payment of payments) {
    const next = derivePaymentStatus(payment);
    if (payment.paymentStatus !== next) {
      payment.paymentStatus = next;
      await payment.save();
      updated++;
    }
  }
  return updated;
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
    return monthIndex(b.month) - monthIndex(a.month);
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
