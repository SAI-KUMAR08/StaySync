import mongoose from "mongoose";
import { Owner, Hostel, Tenant, OTP } from "../../models/index.js";
import { env } from "../../config/env.js";
import { ACCOUNT } from "../../utils/constants.js";
import { AppError } from "../../middleware/error.middleware.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendOtpEmail } from "../emailService.js";
import { generateTemporaryPassword } from "../../utils/password.js";
import {
  verifyOTP,
  resolveOwnerHostel,
  checkOtpCooldown,
  generateOtp,
  buildAuthUser,
  issueTokens,
  recordIpFailure,
  checkIpFailureRate,
  clearIpFailures,
} from "./helpers.js";

/**
 * Ensure the predefined admin Owner exists (auto-created on first login).
 * Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 */
async function ensureAdminOwner(email) {
  const adminEmail = env.ADMIN_EMAIL;
  if (!adminEmail || email.trim().toLowerCase() !== adminEmail.toLowerCase()) return null;
  let owner = await Owner.findOne({ email: adminEmail, isActive: true });
  if (!owner) {
    // Password is bcrypt-hashed by the Owner pre-save hook.
    owner = await Owner.create({
      name: "Admin",
      email: adminEmail,
      password: env.ADMIN_PASSWORD,
      role: "owner",
      phone: "",
      isActive: true,
      emailVerified: true,
    });
  }
  return owner;
}

export async function registerOwner({ name, email, password, phone, hostelName, address, city }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existingOwner = await Owner.findOne({ email: normalizedEmail });
  if (existingOwner) {
    throw new AppError("Email already registered", 409);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [owner] = await Owner.create(
      [{ name: name.trim(), email: normalizedEmail, password, phone: phone?.trim() }],
      { session }
    );

    const [hostel] = await Hostel.create(
      [
        {
          ownerId: owner._id,
          name: hostelName.trim(),
          address: address?.trim(),
          city: city?.trim(),
          contactPhone: phone?.trim(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const tokens = await issueTokens(owner, "owner", {
      ownerId: owner._id,
      hostelId: hostel._id,
    });

    return {
      user: buildAuthUser(owner, "owner", {
        ownerId: owner._id.toString(),
        hostelId: hostel._id.toString(),
        hostelName: hostel.name || hostel.hostelName || "",
      }),
      ...tokens,
    };
  } catch (err) {
    await session.abortTransaction();
    if (err instanceof AppError) throw err;
    if (err.code === 11000) throw new AppError("Email already registered", 409);
    console.error("[registerOwner] Registration failed:", err);
    throw new AppError("Registration failed. Please try again.", 500);
  } finally {
    session.endSession();
  }
}

/**
 * Step 1 of Owner Signup with Verification OTP
 */
export async function sendOwnerOtp({ name, email, password, phone, hostelName, address, city }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  password = password || generateTemporaryPassword();

  if (normalizedPhone.length < 10) {
    throw new AppError("Enter a valid 10-digit mobile number", 400);
  }

  // Check if owner or tenant already exists and is active
  const [existingOwner, existingTenant] = await Promise.all([
    Owner.findOne({ email: normalizedEmail, isActive: true }),
    Tenant.findOne({ "personalInfo.email": normalizedEmail, isActive: true }),
  ]);
  if (existingOwner || existingTenant) throw new AppError("Email already registered", 409);

  const { otpVal, expiresAt } = generateOtp();

  // Find or update/create inactive Owner record
  let owner = await Owner.findOne({ email: normalizedEmail, isActive: false });
  if (owner) {
    owner.name = name.trim();
    owner.phone = normalizedPhone;
    owner.password = password; // pre-save hashes this
    await owner.save();
  } else {
    owner = await Owner.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      isActive: false,
    });
  }

  // Find or update/create inactive Hostel configuration
  let hostel = await Hostel.findOne({ ownerId: owner._id, isActive: false });
  if (hostel) {
    hostel.name = hostelName.trim();
    hostel.address = address?.trim();
    hostel.city = city?.trim();
    hostel.contactPhone = normalizedPhone;
    await hostel.save();
  } else {
    await Hostel.create({
      ownerId: owner._id,
      name: hostelName.trim(),
      address: address?.trim(),
      city: city?.trim(),
      contactPhone: normalizedPhone,
      isActive: false,
    });
  }

  await checkOtpCooldown(owner);
  // Save OTP in the OTP collection
  await OTP.findOneAndUpdate(
    { userId: owner._id, mobile: normalizedPhone },
    { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
    { upsert: true, new: true }
  );

  // Send OTP via email
  await sendOtpEmail({
    to: normalizedEmail,
    otp: otpVal,
    purpose: "Owner Registration",
    name: name.trim(),
  });

  return { message: "OTP sent successfully" };
}

/**
 * Step 2 of Owner Signup: Verify OTP and activate registration
 */
export async function verifyOwnerOtpAndRegister({ email, otp }) {
  const normalizedEmail = email.trim().toLowerCase();

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: false });
  if (!owner) {
    throw new AppError("Owner registration session not found. Please register again.", 404);
  }

  await verifyOTP(owner._id, otp);

  // Activate owner
  owner.isActive = true;
  await owner.save();

  // Activate associated hostel
  const hostel = await Hostel.findOneAndUpdate(
    { ownerId: owner._id, isActive: false },
    { isActive: true },
    { new: true }
  );
  if (!hostel) throw new AppError("Hostel setup failed", 404);

  const tokens = await issueTokens(owner, "owner", {
    ownerId: owner._id,
    hostelId: hostel._id,
  });

  return {
    user: buildAuthUser(owner, "owner", {
      ownerId: owner._id.toString(),
      hostelId: hostel._id.toString(),
      hostelName: hostel.name || hostel.hostelName || "",
    }),
    ...tokens,
  };
}

/**
 * Step 1 of Owner Login: Send OTP to owner's email
 */
export async function sendOwnerLoginOtp({ email }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Ensure admin owner exists if using the predefined admin credentials
  const adminOwner = await ensureAdminOwner(normalizedEmail);
  if (adminOwner) {
    await checkOtpCooldown(adminOwner);
    const { otpVal, expiresAt } = generateOtp();
    await OTP.findOneAndUpdate(
      { userId: adminOwner._id, mobile: normalizedEmail },
      { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
      { upsert: true, new: true }
    );
    await sendOtpEmail({
      to: normalizedEmail,
      otp: otpVal,
      purpose: "Owner Login",
      name: adminOwner.name,
    });
    return { message: "OTP sent to your email" };
  }

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true });
  if (!owner) {
    throw new AppError("No active account found with this email", 404);
  }

  await checkOtpCooldown(owner);
  const { otpVal, expiresAt } = generateOtp();

  await OTP.findOneAndUpdate(
    { userId: owner._id, mobile: normalizedEmail },
    { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
    { upsert: true, new: true }
  );

  await sendOtpEmail({
    to: normalizedEmail,
    otp: otpVal,
    purpose: "Owner Login",
    name: owner.name,
  });

  return { message: "OTP sent to your email" };
}

/**
 * Step 2 of Owner Login: Verify OTP and log in
 */
export async function verifyOwnerLoginOtp({ email, otp }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  // Ensure admin owner exists if using the predefined admin credentials
  const adminOwner = await ensureAdminOwner(normalizedEmail);
  if (adminOwner) {
    await verifyOTP(adminOwner._id, otp);
    await adminOwner.resetLoginAttempts();
    const { ownerId, hostelId, hostel } = await resolveOwnerHostel(adminOwner);
    if (!hostel) throw new AppError("No active hostel found", 404);
    const tokens = await issueTokens(adminOwner, adminOwner.role, { ownerId, hostelId, ...meta });
    return {
      user: buildAuthUser(adminOwner, adminOwner.role, {
        ownerId: ownerId.toString(),
        hostelId: hostelId.toString(),
        hostelName: hostel.name || hostel.hostelName || "",
      }),
      ...tokens,
    };
  }

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true });
  if (!owner) {
    throw new AppError("No active account found with this email", 404);
  }

  await verifyOTP(owner._id, otp);

  await owner.resetLoginAttempts();

  const { ownerId, hostelId, hostel } = await resolveOwnerHostel(owner);
  if (!hostel) throw new AppError("No active hostel found", 404);

  const tokens = await issueTokens(owner, owner.role, {
    ownerId,
    hostelId,
    ...meta,
  });

  return {
    user: buildAuthUser(owner, owner.role, {
      ownerId: ownerId.toString(),
      hostelId: hostelId.toString(),
      hostelName: hostel.name || hostel.hostelName || "",
    }),
    ...tokens,
  };
}

export async function loginUser({ email, password }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  // Predefined admin account (credentials come from ADMIN_EMAIL / ADMIN_PASSWORD env vars).
  // The admin flows through the same bcrypt + lockout path as every other owner.
  if (env.ADMIN_EMAIL && normalizedEmail === env.ADMIN_EMAIL.toLowerCase()) {
    let user = await Owner.findOne({ email: normalizedEmail, isActive: true }).select("+password");
    if (!user) {
      // Auto-create the admin owner if they don't exist yet (password hashed by pre-save hook).
      user = await Owner.create({
        name: "Admin",
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
        role: "owner",
        phone: "",
        isActive: true,
        emailVerified: true,
      });
    }

    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockUntil - new Date()) / 1000 / 60);
      throw new AppError(`Account temporarily locked. Try again in ${remaining} minute(s).`, 429);
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      recordIpFailure(user._id.toString(), meta.ipAddress);
      checkIpFailureRate(user._id.toString(), meta.ipAddress);
      await user.incrementLoginAttempts();
      const attemptsLeft = ACCOUNT.MAX_LOGIN_ATTEMPTS - (user.loginAttempts || 0);
      const msg =
        attemptsLeft > 0
          ? `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account is locked.`
          : "Account locked due to too many failed attempts. Try again in 15 minutes.";
      throw new AppError(msg, 401);
    }

    await user.resetLoginAttempts();
    clearIpFailures(user._id.toString(), meta.ipAddress);

    const { ownerId, hostelId, hostel } = await resolveOwnerHostel(user);
    if (!hostel) throw new AppError("No active hostel found. Please create a hostel first.", 404);

    const tokens = await issueTokens(user, user.role, { ownerId, hostelId, ...meta });
    return {
      user: buildAuthUser(user, user.role, {
        ownerId: ownerId.toString(),
        hostelId: hostelId.toString(),
        hostelName: hostel.name || hostel.hostelName || "",
      }),
      ...tokens,
    };
  }

  // Only the account matching ADMIN_EMAIL can log in via password.
  // There is no "regular owner" role — one admin, set by the ADMIN_EMAIL env var.
  // If ADMIN_EMAIL changes in Railway, the previous email is automatically locked out.
  throw new AppError("Invalid credentials", 401);
}

export async function switchOwnerHostel({ ownerId, hostelId }) {
  const owner = await Owner.findById(ownerId);
  if (!owner?.isActive) throw new AppError("User inactive", 401);

  const hostel = await Hostel.findOne({ _id: hostelId, ownerId, isActive: true });
  if (!hostel) throw new AppError("Hostel not found", 404);

  const tokens = await issueTokens(owner, "owner", {
    ownerId: owner._id,
    hostelId: hostel._id,
  });

  return {
    user: buildAuthUser(owner, "owner", {
      ownerId: owner._id.toString(),
      hostelId: hostel._id.toString(),
      hostelName: hostel.name || hostel.hostelName || "",
    }),
    ...tokens,
  };
}

/**
 * Step 1 of Owner Forgot Password: send OTP to the owner's registered email.
 */
export async function sendOwnerForgotOtp({ email }) {
  const normalizedEmail = email.trim().toLowerCase();

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true });
  if (!owner) throw new AppError("No active account found with this email", 404);

  await checkOtpCooldown(owner);
  const { otpVal, expiresAt } = generateOtp();

  await OTP.findOneAndUpdate(
    { userId: owner._id, mobile: normalizedEmail },
    { otp: otpVal, expiresAt, verified: false, failedAttempts: 0 },
    { upsert: true, new: true }
  );

  await sendOtpEmail({
    to: normalizedEmail,
    otp: otpVal,
    purpose: "Password Reset",
    name: owner.name,
  });

  return {
    message: "OTP sent to your registered email",
  };
}

/**
 * Step 2 of Owner Forgot Password: verify OTP then set a new password.
 */
export async function resetOwnerPassword({ email, otp, newPassword }) {
  const normalizedEmail = email.trim().toLowerCase();

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true }).select("+password");
  if (!owner) throw new AppError("No active account found with this email", 404);

  await verifyOTP(owner._id, otp);

  owner.password = newPassword;
  await owner.save();

  // Revoke all existing sessions so the owner must log in again on every device.
  const { RefreshToken } = await import("../../models/index.js");
  await RefreshToken.deleteMany({ userId: owner._id });

  return { message: "Password reset successfully. Please log in with your new password." };
}
