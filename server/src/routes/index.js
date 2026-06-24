import { Router } from "express";
import { authenticate, authorize, ownerScope, tenantScope } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";
import * as owner from "../controllers/ownerController.js";
import * as tenant from "../controllers/tenantController.js";
import {
  tenantCreateSchema,
  tenantUpdateSchema,
  idParamSchema,
} from "../validators/resources.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ success: true, message: "MyHostel API is running" });
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

const ownerAuth = [authenticate, authorize("owner"), ownerScope];
const tenantAuth = [authenticate, authorize("tenant"), tenantScope];

export default router;
