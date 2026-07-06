import cron from "node-cron";
import { Tenant, Payment, Hostel } from "../models/index.js";
import { logActivity } from "./activityService.js";

export const initCronJobs = () => {
  // Run daily at 00:00 to check for billing anniversaries & apply late fees
  cron.schedule("0 0 * * *", async () => {
    console.log("🕒 Running daily rent generation & late fee engine...");
    try {
      // 1. Rent Generation — iterate per hostel to ensure tenant scoping
      const hostels = await Hostel.find({ isActive: true });
      let rentCount = 0;

      const now = new Date();
      const currentDay = now.getDate();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthStr = now.toLocaleString("default", { month: "long" });
      const year = now.getFullYear();

      for (const hostel of hostels) {
        const activeTenantsCursor = Tenant.find({ isActive: true, ownerId: hostel.ownerId, hostelId: hostel._id }).cursor();

        for (let tenant = await activeTenantsCursor.next(); tenant != null; tenant = await activeTenantsCursor.next()) {
          if (!tenant.monthlyRent || tenant.monthlyRent <= 0) continue;

          const joinDate = new Date(tenant.joinDate || tenant.createdAt);
          const anniversaryDay = joinDate.getDate();

          const isAnniversary =
            currentDay === anniversaryDay ||
            (anniversaryDay > lastDayOfMonth && currentDay === lastDayOfMonth);

          if (isAnniversary) {
            const exists = await Payment.findOne({
              tenantId: tenant._id,
              paymentMonth: monthStr,
              year
            });

            if (!exists) {
              const dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + 5); // 5 days to pay

              const payment = await Payment.create({
                ownerId: tenant.ownerId,
                hostelId: tenant.hostelId,
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

              await logActivity({
                ownerId: tenant.ownerId,
                hostelId: tenant.hostelId,
                actorId: tenant.ownerId,
                actorRole: "system",
                action: "rent_generated",
                entityType: "payment",
                entityId: payment._id,
              });

              rentCount++;
            }
          }
        }
      }

      // 2. Late Fee Application — per hostel for scoped processing
      let lateCount = 0;
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (const hostel of hostels) {
        const unpaidPaymentsCursor = Payment.find({
          ownerId: hostel.ownerId,
          hostelId: hostel._id,
          paymentStatus: { $in: ["unpaid", "overdue"] },
        }).cursor();

        for (let payment = await unpaidPaymentsCursor.next(); payment != null; payment = await unpaidPaymentsCursor.next()) {
          const dueDate = new Date(payment.dueDate);
          const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

          const diffTime = todayMidnight - dueMidnight;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 0) {
            const graceDays = hostel.lateFeeGracePeriodDays ?? 5;
            const dailyRate = hostel.lateFeeDailyRate ?? 50;

            if (diffDays > graceDays) {
              // Cap late fee at 50% of rent amount to prevent runaway charges
              const rawFine = diffDays * dailyRate;
              const maxFine = Math.max(payment.amount * 0.5, 0);
              const fineAmount = Math.min(rawFine, maxFine);
              if (payment.fineAmount !== fineAmount || payment.paymentStatus !== "overdue") {
                payment.fineAmount = fineAmount;
                payment.totalAmount = payment.amount + fineAmount;
                payment.paymentStatus = "overdue";
                await payment.save();
                lateCount++;
              }
            }
          }
        }
      }
      console.log(`✅ Updated ${lateCount} overdue invoices with late fees today.`);
    } catch (error) {
      console.error("❌ Error in cron engine:", error);
    }
  });

  console.log("🕒 Cron jobs initialized");
};
