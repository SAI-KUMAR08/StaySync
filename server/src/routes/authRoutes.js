import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import {
  registerSchema,
  ownerSendOtpSchema,
  ownerVerifyOtpSchema,
  loginSchema,
  refreshSchema,
  updateProfileSchema,
  changePasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  switchHostelSchema,
} from "../validators/auth.js";
import * as authController from "../controllers/authController.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/register-owner", authLimiter, validate(registerSchema), authController.register);
router.post("/owner/send-otp", authLimiter, validate(ownerSendOtpSchema), authController.sendOwnerOtp);
router.post("/owner/verify-otp", authLimiter, validate(ownerVerifyOtpSchema), authController.verifyOwnerOtp);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/send-otp", otpLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post("/verify-otp", otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post("/tenant/send-otp", otpLimiter, validate(sendOtpSchema), authController.sendOtp);
router.post("/tenant/verify-otp", otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);
router.post("/switch-hostel", authenticate, authLimiter, validate(switchHostelSchema), authController.switchHostel);
router.patch("/profile", authenticate, authLimiter, validate(updateProfileSchema), authController.updateProfile);
router.patch("/password", authenticate, authLimiter, validate(changePasswordSchema), authController.changePassword);

export default router;
