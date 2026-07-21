import cron from "node-cron";
import { Tenant, Payment, PaymentRequest, Hostel, Complaint, BedShiftRequest, RoomAssignmentHistory, Notice } from "../models/index.js";
import { logActivity } from "./activityService.js";

export const initCronJobs = () => {
  // Run daily at 00:00 to check for billing anniversaries & apply late fees
  cron.schedule("0 0 * * *", async () => {
    console.log("🕒 Running daily rent generation & late fee engine...");
    try {
      const now = new Date();
      const currentDay = now.getDate();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthStr = now.toLocaleString("default", { month: "long" });
      const year = now.getFullYear();

      // 1. Rent Generation — batch-find all tenants whose billing anniversary is today
      const hostels = await Hostel.find({ isActive: true }).lean();
      let rentCount = 0;

      for (const hostel of hostels) {
        const tenants = await Tenant.find({
          isActive: true,
          ownerId: hostel.ownerId,
          hostelId: hostel._id,
          monthlyRent: { $gt: 0 },
        }).select("_id ownerId hostelId bedId monthlyRent moveInDate createdAt").lean();

        const tenantIds = tenants.map(t => t._id);
        const existingPayments = await Payment.find({
          tenantId: { $in: tenantIds },
          paymentMonth: monthStr,
          year,
        }).select("tenantId").lean();
        const existingSet = new Set(existingPayments.map(p => p.tenantId.toString()));

        const toCreate = [];
        for (const tenant of tenants) {
          const joinDate = new Date(tenant.moveInDate || tenant.createdAt);
          const anniversaryDay = joinDate.getDate();
          const isAnniversary =
            currentDay === anniversaryDay ||
            (anniversaryDay > lastDayOfMonth && currentDay === lastDayOfMonth);

          if (!isAnniversary) continue;
          if (existingSet.has(tenant._id.toString())) continue;

          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + 5);
          toCreate.push({
            ownerId: hostel.ownerId,
            hostelId: hostel._id,
            tenantId: tenant._id,
            bedId: tenant.bedId,
            amount: tenant.monthlyRent,
            fineAmount: 0,
            totalAmount: tenant.monthlyRent,
            paymentMonth: monthStr,
            year,
            dueDate,
            paymentStatus: "unpaid",
            notes: `Monthly rent for cycle starting ${now.toDateString()}`,
          });
        }

        if (toCreate.length > 0) {
          const createdPayments = await Payment.insertMany(toCreate);
          rentCount += createdPayments.length;

          await Promise.all(
            createdPayments.map((payment) =>
              logActivity({
                ownerId: hostel.ownerId,
                hostelId: hostel._id,
                actorId: hostel.ownerId,
                actorRole: "system",
                action: "rent_generated",
                entityType: "payment",
                entityId: payment._id,
              })
            )
          );
        }
      }

      console.log(`✅ Created ${rentCount} new rent invoices today.`);

      // 2. Late Fee Application — batch update per hostel
      let lateCount = 0;
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (const hostel of hostels) {
        const unpaidPayments = await Payment.find({
          ownerId: hostel.ownerId,
          hostelId: hostel._id,
          paymentStatus: { $in: ["unpaid", "overdue"] },
        }).select("_id dueDate amount fineAmount totalAmount paymentStatus").lean();

        const bulkOps = [];
        for (const payment of unpaidPayments) {
          const dueDate = new Date(payment.dueDate);
          const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const diffTime = todayMidnight - dueMidnight;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 0) {
            const graceDays = hostel.lateFeeGracePeriodDays ?? 5;
            const dailyRate = hostel.lateFeeDailyRate ?? 50;

            if (diffDays > graceDays) {
              const rawFine = diffDays * dailyRate;
              const capFine = payment.amount * 0.5;
              const fineAmount = Math.min(rawFine, capFine);

              if (payment.fineAmount !== fineAmount || payment.paymentStatus !== "overdue") {
                bulkOps.push({
                  updateOne: {
                    filter: { _id: payment._id },
                    update: {
                      $set: {
                        fineAmount,
                        totalAmount: payment.amount + fineAmount,
                        paymentStatus: "overdue",
                      },
                    },
                  },
                });
                lateCount++;
              }
            }
          }
        }

        if (bulkOps.length > 0) {
          await Payment.bulkWrite(bulkOps);
        }
      }

      console.log(`✅ Updated ${lateCount} overdue invoices with late fees today.`);
    } catch (error) {
      console.error("❌ Error in cron engine:", error);
    }
  });

  // Run on the 1st of every month at 00:30 to generate unpaid payments for ALL active tenants
  cron.schedule("30 0 1 * *", async () => {
    console.log("📆 Running monthly 1st-of-month payment generation...");
    try {
      const now = new Date();
      const monthStr = now.toLocaleString("default", { month: "long" });
      const year = now.getFullYear();

      const hostels = await Hostel.find({ isActive: true }).lean();
      let createdCount = 0;

      for (const hostel of hostels) {
        const tenants = await Tenant.find({
          isActive: true,
          ownerId: hostel.ownerId,
          hostelId: hostel._id,
          monthlyRent: { $gt: 0 },
        }).select("_id ownerId hostelId bedId monthlyRent").lean();

        const tenantIds = tenants.map(t => t._id);
        // Check which tenants already have a payment for this month
        const existing = await Payment.find({
          tenantId: { $in: tenantIds },
          paymentMonth: monthStr,
          year,
        }).select("tenantId").lean();
        const existingSet = new Set(existing.map(p => p.tenantId.toString()));

        const toCreate = tenants
          .filter(t => !existingSet.has(t._id.toString()))
          .map(t => ({
            ownerId: hostel.ownerId,
            hostelId: hostel._id,
            tenantId: t._id,
            bedId: t.bedId,
            amount: t.monthlyRent,
            fineAmount: 0,
            totalAmount: t.monthlyRent,
            paymentMonth: monthStr,
            year,
            dueDate: new Date(now.getFullYear(), now.getMonth(), 5), // Due on 5th of the month
            paymentStatus: "unpaid",
            notes: `Monthly rent for ${monthStr} ${year}`,
          }));

        if (toCreate.length > 0) {
          const created = await Payment.insertMany(toCreate);
          createdCount += created.length;

          await Promise.all(
            created.map(payment =>
              logActivity({
                ownerId: hostel.ownerId,
                hostelId: hostel._id,
                actorId: hostel.ownerId,
                actorRole: "system",
                action: "rent_generated",
                entityType: "payment",
                entityId: payment._id,
              })
            )
          );
        }
      }

      console.log(`✅ Created ${createdCount} monthly rent payments for all active residents.`);
    } catch (error) {
      console.error("❌ Error in monthly payment generation:", error);
    }
  });

  // Run daily at 03:00 to check for incomplete resident profiles and create/resolve notices
  cron.schedule("0 3 * * *", async () => {
    console.log("🔍 Running incomplete profile check...");
    try {
      const hostels = await Hostel.find({ isActive: true }).lean();
      let createdCount = 0;
      let resolvedCount = 0;

      for (const hostel of hostels) {
        const f = { ownerId: hostel.ownerId, hostelId: hostel._id };
        const tenants = await Tenant.find({ ...f, isActive: true }).lean();

        const incompleteTenants = tenants.filter((t) => {
          const name = t.name || t.personalInfo?.name;
          return !(
            name && name.trim() !== "" &&
            t.roomId &&
            (t.personalInfo?.phone || t.phone) &&
            t.emergencyContact &&
            t.aadhaarNumber &&
            t.idProof &&
            t.offlineBookingForm
          );
        });

        const completeTenantIds = tenants
          .filter((t) => !incompleteTenants.includes(t))
          .map((t) => t._id.toString());

        // Close notices for tenants whose profiles are now complete
        if (completeTenantIds.length > 0) {
          const closeResult = await Notice.updateMany(
            {
              ...f,
              type: "system_incomplete_profile",
              isActive: true,
              title: "Immediate Action Required",
            },
            { $set: { isActive: false } }
          );
          resolvedCount += closeResult.modifiedCount;
        }

        // Create notices for incomplete profiles
        for (const tenant of incompleteTenants) {
          const name = tenant.name || tenant.personalInfo?.name || "Unknown";
          const missing = [];
          if (!name || name.trim() === "") missing.push("Full Name");
          if (!tenant.roomId) missing.push("Room Number");
          if (!(tenant.personalInfo?.phone || tenant.phone)) missing.push("Mobile Number");
          if (!tenant.emergencyContact) missing.push("Emergency Contact");
          if (!tenant.aadhaarNumber) missing.push("Aadhaar Number");
          if (!tenant.idProof) missing.push("ID Proof Document");
          if (!tenant.offlineBookingForm) missing.push("Registration Form Document");

          // Check if notice already exists for this tenant's incomplete profile
          const existingNotice = await Notice.findOne({
            ...f,
            type: "system_incomplete_profile",
            isActive: true,
            title: "Immediate Action Required",
            message: { $regex: name, $options: "i" },
          });

          if (!existingNotice) {
            await Notice.create({
              ...f,
              title: "Immediate Action Required",
              message: `Resident ${name}'s profile is incomplete. Missing: ${missing.join(", ")}. Immediate action required.`,
              type: "system_incomplete_profile",
              priority: "high",
              isActive: true,
            });
            createdCount++;
          }
        }
      }

      console.log(`✅ Incomplete profile check: ${createdCount} notices created, ${resolvedCount} resolved.`);
    } catch (error) {
      console.error("❌ Error in incomplete profile check:", error);
    }
  });

  // Run daily at 01:00 to clean up inactive tenants past their retention period
  cron.schedule("0 1 * * *", async () => {
    console.log("🧹 Running inactive tenant cleanup...");
    try {
      const now = new Date();
      const expiredTenants = await Tenant.find({
        isActive: false,
        scheduledDeletionDate: { $lte: now },
      }).lean();

      if (expiredTenants.length === 0) {
        console.log("✅ No tenants to clean up.");
        return;
      }

      const ids = expiredTenants.map((t) => t._id);

      await Payment.deleteMany({ tenantId: { $in: ids } });
      await PaymentRequest.deleteMany({ tenantId: { $in: ids } });
      await Complaint.deleteMany({ tenantId: { $in: ids } });
      await RoomAssignmentHistory.deleteMany({ tenantId: { $in: ids } });
      await BedShiftRequest.deleteMany({ tenantId: { $in: ids } });
      await Notice.updateMany(
        { readBy: { $in: ids } },
        { $pull: { readBy: { $in: ids } } }
      );
      await Tenant.deleteMany({ _id: { $in: ids } });

      console.log(`✅ Permanently deleted ${expiredTenants.length} inactive tenants and related records.`);
    } catch (error) {
      console.error("❌ Error in tenant cleanup cron:", error);
    }
  });

  console.log("🕒 Cron jobs initialized");
};
