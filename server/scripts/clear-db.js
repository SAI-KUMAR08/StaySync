import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  Owner,
  Hostel,
  Floor,
  Tenant,
  Room,
  Bed,
  Complaint,
  Payment,
  Notice,
  Expense,
  ActivityLog,
  RefreshToken,
  BedShiftRequest,
  OTP,
  RoomAssignmentHistory,
} from "../src/models/index.js";

dotenv.config();

const models = [
  OTP,
  RoomAssignmentHistory,
  RefreshToken,
  ActivityLog,
  BedShiftRequest,
  Complaint,
  Payment,
  Expense,
  Notice,
  Tenant,
  Bed,
  Room,
  Floor,
  Hostel,
  Owner,
];

async function clearDB() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGO_URL;
    if (!uri) {
      throw new Error("MONGO_URI / MONGO_URL is not set in server/.env");
    }
    console.log("Connecting to MongoDB...");
    const dbName = process.env.MONGO_DB_NAME || "smart-hostel";
    await mongoose.connect(uri, { dbName });

    console.log(`Using database: ${mongoose.connection.db.databaseName}\n`);

    for (const Model of models) {
      const result = await Model.deleteMany({});
      console.log(`  Cleared ${Model.modelName}: ${result.deletedCount} documents`);
    }

    console.log("\n✓ All collections cleared. Register a new owner and set up your hostel from the UI.");
    process.exit(0);
  } catch (error) {
    console.error("Database reset failed:", error.message);
    process.exit(1);
  }
}

clearDB();
