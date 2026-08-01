import { Router } from "express";
import { authenticate, authorize, tenantScope } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { mutationLimiter } from "../middleware/rateLimiter.js";
import * as tenant from "../controllers/tenantController.js";
import {
  complaintCreateSchema,
  bedShiftSchema,
  createVacateRequestSchema,
  idParamSchema,
  paymentRequestSchema,
  profileRequestSchema,
} from "../validators/resources.js";

const router = Router();

router.use(authenticate, authorize("tenant"), tenantScope);

router.get("/dashboard", tenant.getDashboard);
router.get("/room", tenant.getRoomDetails);
router.get("/rooms", tenant.listRooms);
router.get("/payments", tenant.listPayments);
router.get("/complaints", tenant.listComplaints);
router.post(
  "/complaints",
  mutationLimiter,
  validate(complaintCreateSchema),
  tenant.createComplaint
);
router.get("/notices", tenant.listNotices);
router.get("/notifications", tenant.listNotices);
router.post("/notices/:id/read", mutationLimiter, validate(idParamSchema), tenant.markNoticeRead);
router.get("/bed-shift-requests", tenant.listBedShiftRequests);
router.post(
  "/bed-shift-requests",
  mutationLimiter,
  validate(bedShiftSchema),
  tenant.requestBedShift
);
router.delete(
  "/bed-shift-requests/:id",
  mutationLimiter,
  validate(idParamSchema),
  tenant.deleteBedShiftRequest
);

// ── Payment Requests (tenant) ─────────────────────────────
router.post(
  "/payment-request",
  mutationLimiter,
  validate(paymentRequestSchema),
  tenant.createPaymentRequest
);
router.get("/payment-requests", tenant.listPaymentRequests);

// ── Meal Timings (view-only) ────────────────────────────────
router.get("/meal-timings", tenant.listMealTimings);

// ── Vacate Requests ─────────────────────────────────────────
router.post(
  "/vacate-request",
  mutationLimiter,
  validate(createVacateRequestSchema),
  tenant.createVacateRequest
);
router.get("/vacate-requests", tenant.listVacateRequests);
router.delete(
  "/vacate-requests/:id",
  mutationLimiter,
  validate(idParamSchema),
  tenant.deleteVacateRequest
);

// ── Profile (change-request workflow) ───────────────────────
router.get("/profile-completeness", tenant.getProfileCompleteness);
router.post(
  "/profile-request",
  mutationLimiter,
  validate(profileRequestSchema),
  tenant.createProfileRequest
);
router.get("/profile-requests", tenant.listProfileRequests);
router.delete(
  "/profile-requests/:id",
  mutationLimiter,
  validate(idParamSchema),
  tenant.deleteProfileRequest
);

// ── Notification Inbox (durable) ─────────────────────────────
router.get("/inbox", tenant.listInbox);
router.post("/inbox/:id/read", mutationLimiter, validate(idParamSchema), tenant.markInboxRead);
router.post("/inbox/read-all", mutationLimiter, tenant.markAllInboxRead);

export default router;
