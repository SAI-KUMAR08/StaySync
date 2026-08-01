import mongoose from "mongoose";
import { Payment, Tenant } from "../models/index.js";
import { PAYMENT } from "../utils/constants.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthIndex(monthName) {
  const idx = MONTHS.indexOf(monthName);
  return idx >= 0 ? idx : 0;
}

/** pending until due date; overdue after due date passes */
export function derivePaymentStatus(payment, now = new Date()) {
  const currentStatus = payment?.paymentStatus ?? payment?.status;
  // Paid and partial are terminal for the auto-sync — re-deriving a partial
  // payment from its due date would silently destroy the partial progress.
  if (currentStatus === "paid" || currentStatus === "partial") return currentStatus;

  const due = payment?.dueDate ? new Date(payment.dueDate) : null;
  if (!due) return "unpaid";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < today) {
    // A payment must never be Overdue at the moment it is created: keep it
    // Unpaid for 5 full days after creation, then flip to Overdue. This guards
    // against a fresh invoice whose due date is already in the past.
    const created = payment?.createdAt ? new Date(payment.createdAt) : null;
    if (created) {
      const graceEnds = new Date(created.getTime() + PAYMENT.OVERDUE_GRACE_MS);
      if (now >= graceEnds) return "overdue";
      return "unpaid";
    }
    return "overdue"; // no createdAt (legacy record) — keep due-date semantics
  }
  return "unpaid";
}

/**
 * Lightweight status sync — only refreshes payment statuses.
 * Use this for dashboard loads where you just need fresh statuses.
 * Pass `tenantId` to scope the scan to a single tenant (the tenant payment
 * page must not scan + bulk-write the whole hostel on every request).
 */
export async function syncPaymentStatusesOnly(ownerId, hostelId, tenantId) {
  const filter = { ownerId, hostelId, paymentStatus: { $ne: "paid" } };
  if (tenantId) filter.tenantId = tenantId;
  const payments = await Payment.find(filter).lean();

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

  // Ensure active tenants with isSecurityDepositPaid: true have a paid deposit Payment record
  try {
    const tenantFilter = { ownerId, isSecurityDepositPaid: true };
    if (hostelId) tenantFilter.hostelId = hostelId;
    if (tenantId) tenantFilter._id = tenantId;
    const tenantsWithPaidDeposit = await Tenant.find(tenantFilter)
      .select(
        "_id ownerId hostelId personalInfo name securityDepositAmount securityDepositDate createdAt"
      )
      .lean();

    for (const t of tenantsWithPaidDeposit) {
      const depositExists = await Payment.exists({ tenantId: t._id, paymentType: "deposit" });
      if (!depositExists) {
        const date = t.securityDepositDate || t.createdAt || new Date();
        const monthName = date.toLocaleString("en-US", { month: "long" });
        const year = date.getFullYear();
        const amount = t.securityDepositAmount || 1000;
        await Payment.create({
          ownerId: t.ownerId,
          hostelId: t.hostelId,
          tenantId: t._id,
          amount,
          fineAmount: 0,
          totalAmount: amount,
          paymentMonth: monthName,
          year,
          dueDate: date,
          paidDate: date,
          paymentStatus: "paid",
          paymentMethod: "cash",
          paymentType: "deposit",
          notes: `Security deposit for ${t.name || t.personalInfo?.name || "tenant"}`,
        });
      }
    }
  } catch {
    /* non-blocking */
  }

  return bulkOps.length;
}

export async function countOverdueTenants(ownerId, hostelId) {
  const activeTenants = await Tenant.find({ ownerId, hostelId, isActive: true }).select("_id");
  const activeIds = activeTenants.map((t) => t._id);
  if (activeIds.length === 0) return 0;

  return Payment.distinct("tenantId", {
    ownerId,
    hostelId,
    tenantId: { $in: activeIds },
    paymentStatus: "overdue",
    paymentType: { $ne: "deposit" },
  }).then((ids) => ids.length);
}

export async function sumOutstandingByStatus(ownerId, hostelId) {
  const oId =
    ownerId && mongoose.isValidObjectId(ownerId) ? new mongoose.Types.ObjectId(ownerId) : null;
  const hId =
    hostelId && mongoose.isValidObjectId(hostelId) ? new mongoose.Types.ObjectId(hostelId) : null;
  const rows = await Payment.aggregate([
    {
      $match: {
        ownerId: oId,
        hostelId: hId,
        paymentStatus: { $in: ["unpaid", "overdue"] },
        paymentType: { $ne: "deposit" },
      },
    },
    {
      $lookup: {
        from: "tenants",
        localField: "tenantId",
        foreignField: "_id",
        as: "tenant",
      },
    },
    { $unwind: "$tenant" },
    { $match: { "tenant.isActive": true } },
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

/**
 * Validate a tenant's payment-request amount against their outstanding rent
 * invoice for the period. Returns `{ ok: true }` or `{ ok: false, message }`.
 */
export function checkPaymentRequestAmount(amount, invoice) {
  if (!invoice) {
    return {
      ok: false,
      message: "No rent invoice found for this month. Please contact the hostel admin.",
    };
  }
  const expected = invoice.totalAmount ?? invoice.amount ?? 0;
  if (amount !== expected) {
    return {
      ok: false,
      message: `Requested amount ₹${amount.toLocaleString("en-IN")} does not match the outstanding rent of ₹${expected.toLocaleString("en-IN")} for ${invoice.paymentMonth} ${invoice.year}.`,
    };
  }
  return { ok: true, expected };
}

export function groupPaymentsByStatus(payments) {
  const overdue = [];
  const unpaid = [];
  const paid = [];
  const partial = [];

  for (const p of payments) {
    const s = p?.paymentStatus ?? p?.status;
    if (s === "paid") paid.push(p);
    else if (s === "overdue") overdue.push(p);
    else if (s === "partial") partial.push(p);
    else unpaid.push(p);
  }

  const byMonth = (a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return monthIndex(b.paymentMonth || b.month) - monthIndex(a.paymentMonth || a.month);
  };

  overdue.sort(byMonth);
  unpaid.sort(byMonth);
  paid.sort(byMonth);
  partial.sort(byMonth);

  return { overdue, unpaid, paid, partial };
}

export function getCurrentMonthYear() {
  const now = new Date();
  return {
    month: now.toLocaleString("en-US", { month: "long" }),
    year: now.getFullYear(),
  };
}
