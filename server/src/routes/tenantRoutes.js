import { Router } from "express";
import { authenticate, authorize, tenantScope } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as tenant from "../controllers/tenantController.js";
import { complaintCreateSchema, bedShiftSchema, paymentRequestSchema } from "../validators/resources.js";

const router = Router();

router.use(authenticate, authorize("tenant"), tenantScope);

router.get("/dashboard", tenant.getDashboard);
router.get("/room", tenant.getRoomDetails);
router.get("/payments", tenant.listPayments);
router.post("/payments/create-order", tenant.createPaymentOrder);
router.post("/payments/verify", tenant.verifyPayment);
router.get("/complaints", tenant.listComplaints);
router.post("/complaints", validate(complaintCreateSchema), tenant.createComplaint);
router.get("/notices", tenant.listNotices);
router.get("/notifications", tenant.listNotices);
router.post("/notices/:id/read", tenant.markNoticeRead);
router.get("/bed-shift-requests", tenant.listBedShiftRequests);
router.post("/bed-shift-requests", validate(bedShiftSchema), tenant.requestBedShift);

// ── Meal Timings (view-only) ────────────────────────────────
router.get("/meal-timings", tenant.listMealTimings);

// ── Payment Requests (submit) ───────────────────────────────
router.get("/payment-requests", tenant.listPaymentRequests);
router.post("/payment-requests", validate(paymentRequestSchema), tenant.createPaymentRequest);

export default router;
