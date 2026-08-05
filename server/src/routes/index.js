import { Router } from "express";
import mongoose from "mongoose";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";

const router = Router();

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

router.get("/health", (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? "MyHostel API is running" : "Database unavailable",
    db: DB_STATES[mongoose.connection.readyState] ?? "unknown",
    uptime: process.uptime(),
  });
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

export default router;
