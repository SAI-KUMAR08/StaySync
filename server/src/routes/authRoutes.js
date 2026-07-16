import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import {
  registerSchema,
  ownerSendOtpSchema,
  ownerVerifyOtpSchema,
  ownerLoginOtpSchema,
  ownerVerifyLoginOtpSchema,
  loginSchema,
  refreshSchema,
  updateProfileSchema,
  changePasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  switchHostelSchema,
  tenantLoginSchema,
  tenantSetPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  tenantCheckSchema,
} from "../validators/auth.js";
import * as authController from "../controllers/authController.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/register-owner", authLimiter, validate(registerSchema), authController.register);
router.post("/owner/send-otp", authLimiter, validate(ownerSendOtpSchema), authController.sendOwnerOtp);
router.post("/owner/verify-otp", authLimiter, validate(ownerVerifyOtpSchema), authController.verifyOwnerOtp);
router.post("/owner/login/send-otp", authLimiter, validate(ownerLoginOtpSchema), authController.sendOwnerLoginOtp);
router.post("/owner/login/verify-otp", authLimiter, validate(ownerVerifyLoginOtpSchema), authController.verifyOwnerLoginOtp);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/send-otp", otpLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post("/verify-otp", otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post("/tenant/send-otp", otpLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post("/tenant/verify-otp", otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post("/tenant/check-status", otpLimiter, validate(tenantCheckSchema), authController.checkTenantStatus);
router.post("/tenant/login", otpLimiter, validate(tenantLoginSchema), authController.tenantLogin);
router.post("/tenant/set-password", otpLimiter, validate(tenantSetPasswordSchema), authController.tenantSetPassword);
router.post("/tenant/forgot-password", otpLimiter, validate(forgotPasswordSchema), authController.sendForgotOtp);
router.post("/tenant/reset-password", otpLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);
router.post("/switch-hostel", authenticate, authLimiter, validate(switchHostelSchema), authController.switchHostel);
router.patch("/profile", authenticate, authLimiter, validate(updateProfileSchema), authController.updateProfile);
router.patch("/password", authenticate, authLimiter, validate(changePasswordSchema), authController.changePassword);

// ── Session management ─────────────────────────────────
router.get("/sessions", authenticate, authController.listSessions);
router.delete("/sessions/:familyId", authenticate, authController.revokeSession);

export default router;
