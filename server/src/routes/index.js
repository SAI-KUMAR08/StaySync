import { Router } from "express";
import mongoose from "mongoose";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";

const router = Router();

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

router.get("/health", async (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  let dbInfo = {};
  if (dbOk) {
    try {
      const db = mongoose.connection.db;
      const dbName = db.databaseName;
      const ownerCount = await db.collection("owners").countDocuments();
      const hostelCount = await db.collection("hostels").countDocuments();
      const mealCount = await db.collection("mealtimings").countDocuments();
      const hostels = await db
        .collection("hostels")
        .find({}, { projection: { name: 1 } })
        .toArray();
      dbInfo = {
        dbName,
        ownerCount,
        hostelCount,
        mealCount,
        hostelNames: hostels.map((h) => h.name),
      };
    } catch (e) {
      dbInfo = { error: e.message };
    }
  }

  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? "MyHostel API is running" : "Database unavailable",
    db: DB_STATES[mongoose.connection.readyState] ?? "unknown",
    uptime: process.uptime(),
    ...dbInfo,
  });
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

export default router;
