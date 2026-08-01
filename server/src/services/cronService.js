import cron from "node-cron";
import {
  Tenant,
  Hostel,
  Payment,
  PaymentRequest,
  Complaint,
  BedShiftRequest,
  RoomAssignmentHistory,
  Notice,
  VacateRequest,
  ActivityLog,
  Notification,
  ProfileUpdateRequest,
  TemporaryAllotmentRequest,
} from "../models/index.js";
import { withCronLock } from "./cronLock.js";
import { logCron, recordCronRun } from "../utils/cronLogger.js";
import { getEnglishMonthName } from "../utils/date.js";
import { getMissingProfileFields } from "../utils/profileCompleteness.js";

/** Per-job lock TTL. Jobs are short, so 30 minutes is generous headroom. */
const LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * Run a cron job guarded by a distributed lock and tracked via structured logs.
 * `jobName` identifies the job across log lines / lock documents.
 */
async function runScheduledJob(jobName, fn) {
  logCron(jobName, "info", "Starting cron job");
  try {
    const result = await withCronLock(`cron:${jobName}`, LOCK_TTL_MS, fn);
    if (result === null) {
      recordCronRun(jobName, "skipped");
      return;
    }
    recordCronRun(jobName, "success", { ...(result || {}) });
    logCron(jobName, "info", "Cron job completed", result || {});
  } catch (error) {
    recordCronRun(jobName, "error", { error: error?.message || String(error) });
    logCron(jobName, "error", "Cron job failed", { error: error?.message || String(error) });
  }
}

export const initCronJobs = () => {
  // Run on the 2nd of every month at 00:00 to generate monthly fees
  cron.schedule("0 0 2 * *", async () => {
    await runScheduledJob("monthly-fee-generation", async () => {
      const now = new Date();
      const monthStr = getEnglishMonthName(now);
      const year = now.getFullYear();
      const hostels = await Hostel.find({ isActive: true }).lean();
      let createdCount = 0;

      for (const hostel of hostels) {
        try {
          const tenants = await Tenant.find({
            isActive: true,
            ownerId: hostel.ownerId,
            hostelId: hostel._id,
            monthlyRent: { $gt: 0 },
          })
            .select("_id ownerId hostelId monthlyRent")
            .lean();

          const tenantIds = tenants.map((t) => t._id);
          // Check for existing payments this month
          const existingPayments = await Payment.find({
            tenantId: { $in: tenantIds },
            paymentMonth: monthStr,
            year,
          })
            .select("tenantId")
            .lean();
          const existingSet = new Set(existingPayments.map((p) => p.tenantId.toString()));

          const toCreate = tenants
            .filter((t) => !existingSet.has(t._id.toString()))
            .map((t) => ({
              ownerId: hostel.ownerId,
              hostelId: hostel._id,
              tenantId: t._id,
              amount: t.monthlyRent,
              fineAmount: 0,
              totalAmount: t.monthlyRent,
              paymentMonth: monthStr,
              year,
              dueDate: new Date(now.getFullYear(), now.getMonth(), 7), // 2nd + 5 day grace = 7th
              paymentStatus: "unpaid",
              paymentType: "rent",
              notes: `Monthly rent for ${monthStr} ${year}`,
            }));

          if (toCreate.length > 0) {
            const created = await Payment.insertMany(toCreate);
            createdCount += created.length;

            // Batch the activity log writes instead of fanning out one create per payment.
            await ActivityLog.insertMany(
              created.map((payment) => ({
                ownerId: hostel.ownerId,
                hostelId: hostel._id,
                actorId: hostel.ownerId,
                actorRole: "system",
                action: "rent_generated",
                entityType: "payment",
                entityId: payment._id,
              }))
            );
          }
        } catch (err) {
          logCron("monthly-fee-generation", "error", "Monthly fee error for hostel", {
            hostelId: hostel._id?.toString(),
            error: err?.message || String(err),
          });
        }
      }

      return { generated: createdCount };
    });
  });

  // Run daily at 03:00 to check for incomplete tenant profiles — creates ONE consolidated notice
  cron.schedule("0 3 * * *", async () => {
    await runScheduledJob("incomplete-profile-check", async () => {
      const hostels = await Hostel.find({ isActive: true }).lean();
      let resolvedCount = 0;

      for (const hostel of hostels) {
        try {
          const f = { ownerId: hostel.ownerId, hostelId: hostel._id };
          const tenants = await Tenant.find({ ...f, isActive: true }).lean();

          const incompleteTenants = tenants.filter((t) => getMissingProfileFields(t).length > 0);

          const completeTenantIds = tenants
            .filter((t) => !incompleteTenants.includes(t))
            .map((t) => t._id.toString());

          // Per-tenant durable alert so each incomplete tenant sees their own
          // missing fields in their inbox on login. Upserts while unread (re-alerts
          // if they read it and still haven't fixed the profile); once complete,
          // any lingering unread completeness alert is marked read.
          for (const t of incompleteTenants) {
            const missing = getMissingProfileFields(t, { tenantFacing: true }).map((m) => m.label);
            await Notification.updateOne(
              { ...f, tenantId: t._id, type: "system", read: false },
              {
                $set: {
                  title: "Complete your profile",
                  message: `Your profile is missing: ${missing.join(", ")}. Please update it via My Profile.`,
                },
              },
              { upsert: true }
            );
          }
          if (completeTenantIds.length > 0) {
            await Notification.updateMany(
              { ...f, type: "system", read: false, tenantId: { $in: completeTenantIds } },
              { $set: { read: true } }
            );
          }

          // Close consolidated notice when ALL profiles become complete
          if (completeTenantIds.length === tenants.length) {
            const closeResult = await Notice.updateMany(
              {
                ...f,
                type: "system_incomplete_profile",
                isActive: true,
                title: "Incomplete Tenant Profiles",
              },
              { $set: { isActive: false } }
            );
            resolvedCount += closeResult.modifiedCount;
          }

          // Create ONE consolidated notice listing all incomplete tenants
          if (incompleteTenants.length > 0) {
            const details = incompleteTenants
              .map((t) => {
                const name = t.name || t.personalInfo?.name || "Unknown";
                const missing = getMissingProfileFields(t).map((m) => m.label);
                return `  • ${name} — Missing: ${missing.join(", ")}`;
              })
              .join("\n");

            // Upsert the active consolidated notice with the fresh details so an
            // already-existing notice doesn't go stale as profiles change.
            await Notice.findOneAndUpdate(
              {
                ...f,
                type: "system_incomplete_profile",
                isActive: true,
                title: "Incomplete Tenant Profiles",
              },
              {
                $set: {
                  message: `The following tenants have incomplete profiles:\n${details}\n\nPlease update their records as soon as possible.`,
                  priority: "high",
                  isActive: true,
                },
              },
              { upsert: true, new: true }
            );
          }
        } catch (err) {
          logCron("incomplete-profile-check", "error", "Incomplete profile error for hostel", {
            hostelId: hostel._id?.toString(),
            error: err?.message || String(err),
          });
        }
      }

      return { noticesResolved: resolvedCount };
    });
  });

  // Run daily at 01:00 to clean up inactive tenants past their retention period
  cron.schedule("0 1 * * *", async () => {
    await runScheduledJob("tenant-cleanup", async () => {
      const now = new Date();
      const expiredTenants = await Tenant.find({
        isActive: false,
        scheduledDeletionDate: { $lte: now },
      }).lean();

      if (expiredTenants.length === 0) {
        return { deleted: 0 };
      }

      const ids = expiredTenants.map((t) => t._id);

      await Payment.deleteMany({ tenantId: { $in: ids } });
      await PaymentRequest.deleteMany({ tenantId: { $in: ids } });
      await Complaint.deleteMany({ tenantId: { $in: ids } });
      await RoomAssignmentHistory.deleteMany({ tenantId: { $in: ids } });
      await BedShiftRequest.deleteMany({ tenantId: { $in: ids } });
      await VacateRequest.deleteMany({ tenantId: { $in: ids } });
      // Newer collections added after the original cascade — purge so a
      // hard-deleted tenant never leaves orphaned docs behind.
      await ProfileUpdateRequest.deleteMany({ tenantId: { $in: ids } });
      await TemporaryAllotmentRequest.deleteMany({ tenantId: { $in: ids } });
      await Notification.deleteMany({ tenantId: { $in: ids } });
      await Notice.updateMany({ readBy: { $in: ids } }, { $pull: { readBy: { $in: ids } } });
      await Tenant.deleteMany({ _id: { $in: ids } });

      return { deleted: expiredTenants.length };
    });
  });

  // Run daily at 07:00 to remind tenants with an overdue rent bill. A tenant
  // with an unpaid rent whose due date has passed gets a "Rent overdue" inbox
  // notification every morning until the bill is settled (upsert-while-unread).
  cron.schedule("0 7 * * *", async () => {
    await runScheduledJob("rent-overdue-reminder", async () => {
      const hostels = await Hostel.find({ isActive: true }).lean();
      let reminded = 0;
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      for (const hostel of hostels) {
        try {
          const f = { ownerId: hostel.ownerId, hostelId: hostel._id };
          const tenants = await Tenant.find({ ...f, isActive: true })
            .select("_id name personalInfo.name")
            .lean();
          if (tenants.length === 0) continue;
          const tenantIds = tenants.map((t) => t._id);

          // Rent invoices past their due date and not fully paid.
          const overdue = await Payment.find({
            ...f,
            tenantId: { $in: tenantIds },
            paymentType: "rent",
            paymentStatus: { $in: ["unpaid", "overdue", "partial"] },
            dueDate: { $lt: startToday },
          }).lean();

          const byTenant = new Map();
          for (const p of overdue) {
            const amount = p.totalAmount ?? p.amount ?? 0;
            const prev = byTenant.get(String(p.tenantId)) || { total: 0, months: new Set() };
            prev.total += amount;
            prev.months.add(`${p.paymentMonth} ${p.year}`);
            byTenant.set(String(p.tenantId), prev);
          }

          for (const t of tenants) {
            const due = byTenant.get(String(t._id));
            if (due) {
              const name = t.name || t.personalInfo?.name || "Tenant";
              const monthLabel = [...due.months].slice(0, 3).join(", ");
              await Notification.updateOne(
                { ...f, tenantId: t._id, type: "rent_due", read: false },
                {
                  $set: {
                    title: "Rent overdue",
                    message: `Dear ${name}, your rent of ₹${due.total.toLocaleString("en-IN")} (${monthLabel}) is overdue. Please pay at the earliest.`,
                  },
                },
                { upsert: true }
              );
              reminded += 1;
            } else {
              // No overdue rent — clear any lingering unread reminder.
              await Notification.updateMany(
                { ...f, tenantId: t._id, type: "rent_due", read: false },
                { $set: { read: true } }
              );
            }
          }
        } catch (err) {
          logCron("rent-overdue-reminder", "error", "Overdue reminder error for hostel", {
            hostelId: hostel._id?.toString(),
            error: err?.message || String(err),
          });
        }
      }

      return { reminded };
    });
  });

  console.log("🕒 Cron jobs initialized");
};
