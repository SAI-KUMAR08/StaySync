import { Router } from "express";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ success: true, message: "MyHostel API is running" });
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

export default router;
