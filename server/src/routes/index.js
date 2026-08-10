import { Router } from "express";
import mongoose from "mongoose";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";

const router = Router();

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

router.get("/health", (req, res) => {
  const dbState = DB_STATES[mongoose.connection.readyState] ?? "unknown";
  const dbOk = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: "ok",
    message: "MyHostel API is running",
    db: dbState,
    dbConnected: dbOk,
    uptime: process.uptime(),
  });
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

export default router;
