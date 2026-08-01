import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  Tenant,
  Bed,
  Room,
  Complaint,
  Payment,
  Expense,
  ActivityLog,
  RefreshToken,
  BedShiftRequest,
  OTP,
  RoomAssignmentHistory,
  Notification,
  VacateRequest,
  ProfileUpdateRequest,
  PaymentRequest,
  TemporaryAllotmentRequest,
  CronLock,
} from "../src/models/index.js";

dotenv.config();

/**
 * Clears all tenant/transaction data while PRESERVING:
 *   ✅ MealTiming  — food timings + menu details shown to tenants
 *   ✅ Notice      — hostel rules shown to tenants
 *   ✅ Owner       — admin account
 *   ✅ Hostel      — hostel record (referenced by MealTiming/Notice)
 *   ✅ Floor       — physical structure
 *   ✅ Room        — physical structure (occupiedBeds reset to 0)
 *   ✅ Bed         — physical structure (reset to "available", tenant cleared)
 */
async function clearDB() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGO_URL;
    if (!uri) throw new Error("MONGO_URI / MONGO_URL is not set in server/.env");

    console.log("Connecting to MongoDB...");
    const dbName = process.env.MONGO_DB_NAME || "smart-hostel";
    await mongoose.connect(uri, { dbName });
    console.log(`Connected to database: ${mongoose.connection.db.databaseName}\n`);

    // ── Delete all tenant & transaction collections ─────────────────────────
    const toDelete = [
      OTP,
      RefreshToken,
      ActivityLog,
      RoomAssignmentHistory,
      BedShiftRequest,
      VacateRequest,
      ProfileUpdateRequest,
      PaymentRequest,
      TemporaryAllotmentRequest,
      Complaint,
      Payment,
      Expense,
      Notification,
      CronLock,
      Tenant,
    ];

    for (const Model of toDelete) {
      const result = await Model.deleteMany({});
      console.log(`  ❌ Cleared  ${Model.modelName.padEnd(30)}: ${result.deletedCount} documents`);
    }

    // ── Reset Beds → available (keep physical structure) ───────────────────
    const bedResult = await Bed.updateMany(
      {},
      { $set: { occupancyStatus: "available", tenantId: null, holdUntil: null } }
    );
    console.log(
      `\n  🔄 Reset    ${"Beds → available".padEnd(30)}: ${bedResult.modifiedCount} beds reset`
    );

    // ── Reset Room occupied counters ───────────────────────────────────────
    const roomResult = await Room.updateMany({}, { $set: { occupiedBeds: 0 } });
    console.log(
      `  🔄 Reset    ${"Rooms → occupiedBeds: 0".padEnd(30)}: ${roomResult.modifiedCount} rooms reset`
    );

    console.log("\n✅ Done! Preserved:");
    console.log("   • MealTiming  — food timings & menu details");
    console.log("   • Notice      — hostel rules");
    console.log("   • Owner       — admin account");
    console.log("   • Hostel / Floor / Room / Bed  — physical structure");
    console.log("\n   You can now register tenants fresh from the UI.\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Database reset failed:", error.message);
    process.exit(1);
  }
}

clearDB();
