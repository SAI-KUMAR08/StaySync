import cron from "node-cron";
import { Tenant, Payment, Hostel } from "../models/index.js";
import { logActivity } from "./activityService.js";

export const initCronJobs = () => {
  // Run daily at 00:00 to check for billing anniversaries & apply late fees
  cron.schedule("0 0 * * *", async () => {
    console.log("🕒 Running daily rent generation & late fee engine...");
    try {
      // 1. Rent Generation using cursor
      const activeTenantsCursor = Tenant.find({ isActive: true }).cursor();
      let rentCount = 0;
      
      const now = new Date();
      const currentDay = now.getDate();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthStr = now.toLocaleString("default", { month: "long" });
      const year = now.getFullYear();

      for (let tenant = await activeTenantsCursor.next(); tenant != null; tenant = await activeTenantsCursor.next()) {
        if (!tenant.monthlyRent || tenant.monthlyRent <= 0) continue;
        
        const joinDate = new Date(tenant.joinDate || tenant.createdAt);
        const anniversaryDay = joinDate.getDate();
        
        const isAnniversary = 
          currentDay === anniversaryDay || 
          (anniversaryDay > lastDayOfMonth && currentDay === lastDayOfMonth);

        if (isAnniversary || reqIsFallbackCheck(tenant, monthStr, year)) {
          const exists = await Payment.findOne({
            tenantId: tenant._id,
            paymentMonth: monthStr,
            year
          });

          if (!exists) {
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 5); // 5 days to pay

            await Payment.create({
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
              entityId: tenant._id,
            });
            
            rentCount++;
          }
        }
      }
      console.log(`✅ Generated ${rentCount} rent invoices today.`);

      // 2. Late Fee Application using cursor
      const unpaidPaymentsCursor = Payment.find({ paymentStatus: { $in: ["unpaid", "overdue"] } }).cursor();
      let lateCount = 0;
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (let payment = await unpaidPaymentsCursor.next(); payment != null; payment = await unpaidPaymentsCursor.next()) {
        const dueDate = new Date(payment.dueDate);
        const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

        const diffTime = todayMidnight - dueMidnight;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
          const hostel = await Hostel.findById(payment.hostelId);
          if (hostel) {
            const graceDays = hostel.lateFeeGracePeriodDays ?? 5;
            const dailyRate = hostel.lateFeeDailyRate ?? 50;

            if (diffDays > graceDays) {
              const fineAmount = diffDays * dailyRate;
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

function reqIsFallbackCheck(tenant, month, year) {
   return false;
}
