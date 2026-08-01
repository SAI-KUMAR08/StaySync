import { Tenant, OTP } from "../../models/index.js";
import { env } from "../../config/env.js";
import { ACCOUNT } from "../../utils/constants.js";
import { AppError } from "../../middleware/error.middleware.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendOtpEmail } from "../emailService.js";
import {
  verifyOTP,
  checkOtpCooldown,
  generateOtp,
  buildTenantProfile,
  issueTokens,
  recordIpFailure,
  checkIpFailureRate,
  clearIpFailures,
} from "./helpers.js";

/**
 * First-time password set.
 * Only works when doesPassCreated is false (first login). The tenant verifies
 * their phone exists, then creates a password directly (no OTP).
 */
export async function setInitialTenantPassword({ phone, password }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (tenant.doesPassCreated) {
    throw new AppError("Password already created. Please login with your password.", 400);
  }

  tenant.personalInfo.password = password;
  tenant.doesPassCreated = true;
  await tenant.save();

  // Auto-login after setting password
  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}

export async function sendTenantOtp({ phone }) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) {
    throw new AppError("Enter a valid 10-digit mobile number", 400);
  }

  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  await checkOtpCooldown(tenant);
  const { otpVal, expiresAt } = generateOtp();

  // Save OTP in OTP collection
  await OTP.findOneAndUpdate(
    { userId: tenant._id, mobile: normalized },
    { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
    { upsert: true, new: true }
  );

  // Send OTP via email
  const tenantEmail = tenant.personalInfo?.email || tenant.email;
  if (tenantEmail) {
    await sendOtpEmail({
      to: tenantEmail,
      otp: otpVal,
      purpose: "Tenant Login",
      name: tenant.personalInfo?.name || tenant.name,
    });
  }

  return { message: "OTP sent successfully", ...(!env.SEND_REAL_EMAIL ? { otp: otpVal } : {}) };
}

export async function verifyTenantOtp({ phone, otp }, meta = {}) {
  const normalized = normalizePhone(phone);

  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  await verifyOTP(tenant._id, otp);

  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
    ...meta,
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}

/**
 * Check if a tenant exists and whether they've set a password.
 */
export async function checkTenantStatus({ phone }) {
  const normalized = normalizePhone(phone);
  // First try to find any tenant by phone (active or inactive)
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized });
  if (!tenant) {
    return { exists: false, hasPassword: false, inactive: false };
  }
  if (!tenant.isActive) {
    return { exists: false, hasPassword: false, inactive: true };
  }
  return { exists: true, hasPassword: tenant.doesPassCreated };
}

/**
 * Tenant login with phone + password (for returning tenants).
 */
export async function loginTenantWithPassword({ phone, password }, meta = {}) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true }).select(
    "+personalInfo.password"
  );
  if (!tenant) {
    throw new AppError("No active tenant found with this number", 404);
  }
  if (!tenant.doesPassCreated) {
    throw new AppError("Password not created yet. Please create a password first.", 400);
  }

  // ⛔ Account lockout check
  if (tenant.isLocked()) {
    const remaining = Math.ceil((tenant.lockUntil - new Date()) / 1000 / 60);
    throw new AppError(`Account temporarily locked. Try again in ${remaining} minute(s).`, 429);
  }

  const valid = await tenant.comparePassword(password);
  if (!valid) {
    recordIpFailure(tenant._id.toString(), meta.ipAddress);
    checkIpFailureRate(tenant._id.toString(), meta.ipAddress);
    await tenant.incrementLoginAttempts();
    const attemptsLeft = ACCOUNT.MAX_LOGIN_ATTEMPTS - (tenant.loginAttempts || 0);
    const msg =
      attemptsLeft > 0
        ? `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account is locked.`
        : "Account locked due to too many failed attempts. Try again in 15 minutes.";
    throw new AppError(msg, 401);
  }

  // ✅ Successful login — reset attempts
  await tenant.resetLoginAttempts();
  clearIpFailures(tenant._id.toString(), meta.ipAddress);

  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
    ...meta,
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}

/**
 * Set tenant password after verifying an OTP. Used outside the login flow
 * (e.g. from the tenant profile). Marks doesPassCreated once a password exists.
 */
export async function setTenantPassword({ phone, otp, password }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (tenant.doesPassCreated) {
    throw new AppError("Password already created. Please login with your password.", 400);
  }

  await verifyOTP(tenant._id, otp);

  tenant.personalInfo.password = password;
  tenant.doesPassCreated = true;
  await tenant.save();

  // Auto-login after setting password
  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}

/**
 * Send OTP to tenant's email for password reset.
 */
export async function sendTenantForgotOtp({ phone }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("No active tenant found with this number", 404);
  if (!tenant.doesPassCreated) {
    throw new AppError("Password not created yet. Please create a password first.", 400);
  }

  const email = tenant.personalInfo?.email || tenant.email;
  if (!email || email.includes("@residents.local")) {
    throw new AppError(
      "No valid email on record. Contact your hostel owner to update your email.",
      400
    );
  }

  await checkOtpCooldown(tenant._id);

  const { otpVal, expiresAt } = generateOtp();

  await OTP.findOneAndUpdate(
    { userId: tenant._id, mobile: normalized },
    { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
    { upsert: true, new: true }
  );

  // Send OTP via email
  await sendOtpEmail({
    to: email,
    otp: otpVal,
    purpose: "Password Reset",
    name: tenant.personalInfo?.name || tenant.name,
  });

  return { message: "OTP sent to your registered email" };
}

/**
 * Reset password after verifying OTP sent to email.
 */
export async function resetTenantPassword({ phone, otp, newPassword }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  await verifyOTP(tenant._id, otp);

  tenant.personalInfo.password = newPassword;
  tenant.doesPassCreated = true;
  await tenant.save();

  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}
