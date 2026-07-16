import mongoose from "mongoose";
import crypto from "crypto";
import { Owner, Hostel, Tenant, RefreshToken, OTP } from "../models/index.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { AppError } from "../middleware/error.middleware.js";
import { normalizePhone } from "../utils/phone.js";

import { isMockOtp, DEMO_OTP } from "../config/payments.js";

function buildAuthUser(entity, role, extra = {}) {
  return {
    id: entity._id.toString(),
    name: entity.name || entity.personalInfo?.name || "",
    email: entity.email || entity.personalInfo?.email || "",
    phone: entity.phone || entity.personalInfo?.phone || "",
    role,
    ...extra,
  };
}

async function buildTenantProfile(tenantOrId) {
  let tenant;
  if (tenantOrId && typeof tenantOrId === "object" && tenantOrId._id) {
    tenant = tenantOrId;
    if (!tenant.populated("floorId") || !tenant.populated("roomId") || !tenant.populated("bedId")) {
      await tenant.populate([
        { path: "floorId", select: "floorName floorNumber" },
        { path: "roomId", select: "roomNumber floor" },
        { path: "bedId", select: "bedNumber" },
      ]);
    }
  } else {
    tenant = await Tenant.findById(tenantOrId)
      .populate("floorId", "floorName floorNumber")
      .populate("roomId", "roomNumber floor")
      .populate("bedId", "bedNumber");
  }
  if (!tenant) throw new AppError("Tenant not found", 404);

  const hostel = await Hostel.findById(tenant.hostelId);

  return {
    ...buildAuthUser(tenant, "tenant", {
      ownerId: tenant.ownerId.toString(),
      hostelId: tenant.hostelId.toString(),
      hostelName: hostel?.name || hostel?.hostelName || "",
      roomId: tenant.roomId?._id?.toString() ?? null,
      bedId: tenant.bedId?._id?.toString() ?? null,
    }),
    monthlyRent: tenant.monthlyRent ?? 0,
    rentAmount: tenant.monthlyRent ?? 0,
    roomDetails: {
      roomId: { number: tenant.roomId?.roomNumber ?? "N/A" },
      floorId: { number: tenant.floorId?.level ?? tenant.floorId?.name ?? "—" },
      bedId: { number: tenant.bedId?.bedLabel ?? "—" },
    },
  };
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
    throw new AppError(err.message || "Registration failed", 500);
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

  if (normalizedPhone.length < 10) {
    throw new AppError("Enter a valid 10-digit mobile number", 400);
  }

  // Check if owner or tenant already exists and is active
  const [existingOwner, existingTenant] = await Promise.all([
    Owner.findOne({ email: normalizedEmail, isActive: true }),
    Tenant.findOne({ "personalInfo.email": normalizedEmail, isActive: true }),
  ]);
  if (existingOwner || existingTenant) throw new AppError("Email already registered", 409);

  const otpVal = isMockOtp() ? DEMO_OTP : crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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

  // Check for 60-second OTP cooldown
  const latestOtp = await OTP.findOne({ userId: owner._id }).sort({ createdAt: -1 });
  if (latestOtp && (Date.now() - latestOtp.createdAt.getTime() < 60 * 1000)) {
    throw new AppError("Please wait 60 seconds before requesting a new OTP.", 429);
  }

  // Save OTP in the OTP collection
  await OTP.findOneAndUpdate(
    { userId: owner._id, mobile: normalizedPhone },
    { otp: otpVal, expiresAt, verified: false },
    { upsert: true, new: true }
  );

  if (isMockOtp()) {
    console.log(`[DEMO OTP] Owner ${normalizedPhone} → ${DEMO_OTP} (no SMS sent)`);
    return { message: "OTP sent successfully", otp: DEMO_OTP, mock: true };
  }

  console.log(`[SMS] OTP for Owner ${normalizedPhone}`);
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

  const otpDoc = await OTP.findOne({ userId: owner._id, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const demoOk = isMockOtp() && otp === DEMO_OTP;
  const storedOk =
    otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!demoOk && !storedOk) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  // Mark OTP as verified
  otpDoc.verified = true;
  await otpDoc.save();

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

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true });
  if (!owner) {
    throw new AppError("No active account found with this email", 404);
  }

  // Check for 60-second OTP cooldown
  const latestOtp = await OTP.findOne({ userId: owner._id }).sort({ createdAt: -1 });
  if (latestOtp && (Date.now() - latestOtp.createdAt.getTime() < 60 * 1000)) {
    throw new AppError("Please wait 60 seconds before requesting a new OTP.", 429);
  }

  const otpVal = isMockOtp() ? DEMO_OTP : crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.findOneAndUpdate(
    { userId: owner._id, mobile: normalizedEmail },
    { otp: otpVal, expiresAt, verified: false },
    { upsert: true, new: true }
  );

  if (isMockOtp()) {
    console.log(`[DEMO OTP] Owner login ${normalizedEmail} → ${DEMO_OTP} (no email sent)`);
    return { message: "OTP sent to your email", otp: DEMO_OTP, mock: true };
  }

  console.log(`[EMAIL] Login OTP for owner ${normalizedEmail}`);
  return { message: "OTP sent to your email" };
}

/**
 * Step 2 of Owner Login: Verify OTP and log in
 */
export async function verifyOwnerLoginOtp({ email, otp }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  const owner = await Owner.findOne({ email: normalizedEmail, isActive: true });
  if (!owner) {
    throw new AppError("No active account found with this email", 404);
  }

  const otpDoc = await OTP.findOne({ userId: owner._id, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const demoOk = isMockOtp() && otp === DEMO_OTP;
  const storedOk = otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!demoOk && !storedOk) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  // Mark OTP as verified
  otpDoc.verified = true;
  await otpDoc.save();

  // Reset any previous lockout
  await owner.resetLoginAttempts();

  let ownerId = owner._id;
  let hostelId;
  let hostel;

  if (owner.role === "manager") {
    ownerId = owner.ownerId;
    hostelId = owner.hostelId;
    hostel = await Hostel.findOne({ _id: hostelId, isActive: true });
  } else {
    hostel = await Hostel.findOne({ ownerId: owner._id, isActive: true });
    hostelId = hostel?._id;
  }

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

  const user = await Owner.findOne({ email: normalizedEmail, isActive: true }).select("+password");
  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  // ⛔ Account lockout check
  if (user.isLocked()) {
    const remaining = Math.ceil((user.lockUntil - new Date()) / 1000 / 60);
    throw new AppError(`Account temporarily locked. Try again in ${remaining} minute(s).`, 429);
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    await user.incrementLoginAttempts();
    const attemptsLeft = 5 - (user.loginAttempts || 0);
    const msg =
      attemptsLeft > 0
        ? `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account is locked.`
        : "Account locked due to too many failed attempts. Try again in 15 minutes.";
    throw new AppError(msg, 401);
  }

  // ✅ Successful login — reset attempts
  await user.resetLoginAttempts();

  let ownerId = user._id;
  let hostelId;
  let hostel;

  if (user.role === "manager") {
    ownerId = user.ownerId;
    hostelId = user.hostelId;
    hostel = await Hostel.findOne({ _id: hostelId, isActive: true });
  } else {
    hostel = await Hostel.findOne({ ownerId: user._id, isActive: true });
    hostelId = hostel?._id;
  }

  if (!hostel) throw new AppError("No active hostel found", 404);

  const tokens = await issueTokens(user, user.role, {
    ownerId,
    hostelId,
    ...meta,
  });

  return {
    user: buildAuthUser(user, user.role, {
      ownerId: ownerId.toString(),
      hostelId: hostelId.toString(),
      hostelName: hostel.name || hostel.hostelName || "",
    }),
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

  // Check for 60-second OTP cooldown
  const latestOtp = await OTP.findOne({ userId: tenant._id }).sort({ createdAt: -1 });
  if (latestOtp && (Date.now() - latestOtp.createdAt.getTime() < 60 * 1000)) {
    throw new AppError("Please wait 60 seconds before requesting a new OTP.", 429);
  }

  const otpVal = isMockOtp() ? DEMO_OTP : crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Save OTP in OTP collection
  await OTP.findOneAndUpdate(
    { userId: tenant._id, mobile: normalized },
    { otp: otpVal, expiresAt, verified: false },
    { upsert: true, new: true }
  );

  if (isMockOtp()) {
    console.log(`[DEMO OTP] ${normalized} → ${DEMO_OTP} (no SMS sent)`);
    return { message: "OTP sent successfully", otp: DEMO_OTP, mock: true };
  }

  console.log(`[SMS] OTP for ${normalized}`);
  return { message: "OTP sent successfully" };
}

export async function verifyTenantOtp({ phone, otp }, meta = {}) {
  const normalized = normalizePhone(phone);

  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const otpDoc = await OTP.findOne({ userId: tenant._id, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const demoOk = isMockOtp() && otp === DEMO_OTP;
  const storedOk =
    otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!demoOk && !storedOk) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  // Mark OTP as verified
  otpDoc.verified = true;
  await otpDoc.save();

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
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) {
    return { exists: false, hasPassword: false };
  }
  return { exists: true, hasPassword: tenant.isPasswordSet };
}

/**
 * Tenant login with phone + password (for returning residents).
 */
export async function loginTenantWithPassword({ phone, password }, meta = {}) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true }).select("+personalInfo.password");
  if (!tenant) {
    throw new AppError("No active resident found with this number", 404);
  }
  if (!tenant.isPasswordSet) {
    throw new AppError("Password not set. Please use OTP login to set your password first.", 400);
  }

  // ⛔ Account lockout check
  if (tenant.isLocked()) {
    const remaining = Math.ceil((tenant.lockUntil - new Date()) / 1000 / 60);
    throw new AppError(`Account temporarily locked. Try again in ${remaining} minute(s).`, 429);
  }

  const valid = await tenant.comparePassword(password);
  if (!valid) {
    await tenant.incrementLoginAttempts();
    const attemptsLeft = 5 - (tenant.loginAttempts || 0);
    const msg =
      attemptsLeft > 0
        ? `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account is locked.`
        : "Account locked due to too many failed attempts. Try again in 15 minutes.";
    throw new AppError(msg, 401);
  }

  // ✅ Successful login — reset attempts
  await tenant.resetLoginAttempts();

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
 * First-time password set: verify OTP, then set password + mark isPasswordSet.
 */
export async function setTenantPassword({ phone, otp, password }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);
  if (tenant.isPasswordSet) {
    throw new AppError("Password already set. Please login with your password.", 400);
  }

  // Verify OTP before allowing password set
  const otpDoc = await OTP.findOne({ userId: tenant._id, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const demoOk = isMockOtp() && otp === DEMO_OTP;
  const storedOk = otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!demoOk && !storedOk) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  // Mark OTP as verified
  otpDoc.verified = true;
  await otpDoc.save();

  tenant.personalInfo.password = password;
  tenant.isPasswordSet = true;
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
  if (!tenant) throw new AppError("No active resident found with this number", 404);
  if (!tenant.isPasswordSet) {
    throw new AppError("Password not set yet. Please login via OTP first.", 400);
  }

  const email = tenant.personalInfo?.email || tenant.email;
  if (!email || email.includes("@residents.local")) {
    throw new AppError("No valid email on record. Contact your hostel owner to update your email.", 400);
  }

  // Check 60-second cooldown
  const latestOtp = await OTP.findOne({ userId: tenant._id }).sort({ createdAt: -1 });
  if (latestOtp && (Date.now() - latestOtp.createdAt.getTime() < 60 * 1000)) {
    throw new AppError("Please wait 60 seconds before requesting a new OTP.", 429);
  }

  const otpVal = isMockOtp() ? DEMO_OTP : crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.findOneAndUpdate(
    { userId: tenant._id, mobile: normalized },
    { otp: otpVal, expiresAt, verified: false },
    { upsert: true, new: true }
  );

  if (isMockOtp()) {
    console.log(`[DEMO OTP] Forgot password for ${email} → ${DEMO_OTP} (no email sent)`);
    return { message: "OTP sent to your registered email", otp: DEMO_OTP, mock: true };
  }

  console.log(`[EMAIL] Password reset OTP for ${email}`);
  return { message: "OTP sent to your registered email" };
}

/**
 * Reset password after verifying OTP sent to email.
 */
export async function resetTenantPassword({ phone, otp, newPassword }) {
  const normalized = normalizePhone(phone);
  const tenant = await Tenant.findOne({ "personalInfo.phone": normalized, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const otpDoc = await OTP.findOne({ userId: tenant._id, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const demoOk = isMockOtp() && otp === DEMO_OTP;
  const storedOk = otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!demoOk && !storedOk) {
    throw new AppError("Invalid or expired OTP", 401);
  }

  otpDoc.verified = true;
  await otpDoc.save();

  tenant.personalInfo.password = newPassword;
  tenant.isPasswordSet = true;
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


async function issueTokens(
  user,
  role,
  { ownerId, hostelId, family, deviceInfo, ipAddress, userAgent }
) {
  const payload = {
    sub: user._id.toString(),
    userId: user._id.toString(),
    role,
    email: user.email,
    ownerId: ownerId.toString(),
    hostelId: hostelId.toString(),
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Use provided family or generate a new one (first-time issuance)
  const tokenFamily = family || RefreshToken.generateFamily();

  // Mark any existing current tokens for this family as non-current
  if (family) {
    await RefreshToken.updateMany(
      { userId: user._id, family, isCurrent: true },
      { isCurrent: false }
    );
  }

  await RefreshToken.create({
    userId: user._id,
    role,
    token: refreshToken,
    family: tokenFamily,
    isCurrent: true,
    expiresAt,
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    lastUsedAt: new Date(),
    ownerId,
    hostelId,
  });

  return { accessToken, refreshToken, family: tokenFamily };
}

export async function refreshSession(token, meta = {}) {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }

  const stored = await RefreshToken.findOne({ token });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError("Refresh token expired", 401);
  }

  // ── Reuse detection ─────────────────────────────────
  // If this token is NOT the current one in its family,
  // someone is trying to reuse an old rotated token.
  if (!stored.isCurrent) {
    // Invalidate ALL tokens in this family (attacker + legitimate user)
    await RefreshToken.deleteMany({ userId: stored.userId, family: stored.family });
    throw new AppError(
      "Session compromised. Please log in again.",
      401
    );
  }

  if (decoded.role === "owner" || decoded.role === "manager") {
    const user = await Owner.findById(decoded.sub);
    if (!user?.isActive) throw new AppError("User inactive", 401);

    let ownerId = user._id;
    let hostelId;
    let hostel;

    if (user.role === "manager") {
      ownerId = user.ownerId;
      hostelId = user.hostelId;
      hostel = await Hostel.findOne({ _id: hostelId, isActive: true });
    } else {
      hostel = await Hostel.findOne({ ownerId: user._id, isActive: true });
      hostelId = hostel?._id;
    }
    if (!hostel) throw new AppError("No active hostel found", 404);

    // Rotate: issue new tokens in same family, old becomes non-current
    const tokens = await issueTokens(user, user.role, {
      ownerId,
      hostelId,
      family: stored.family,
      deviceInfo: meta.deviceInfo || stored.deviceInfo,
      ipAddress: meta.ipAddress || stored.ipAddress,
      userAgent: meta.userAgent || stored.userAgent,
    });

    return {
      user: buildAuthUser(user, user.role, {
        ownerId: ownerId.toString(),
        hostelId: hostelId.toString(),
        hostelName: hostel.name || hostel.hostelName || "",
      }),
      ...tokens,
    };
  }

  const tenant = await Tenant.findById(decoded.sub);
  if (!tenant?.isActive) throw new AppError("User inactive", 401);

  // Rotate: issue new tokens in same family
  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
    family: stored.family,
    deviceInfo: meta.deviceInfo || stored.deviceInfo,
    ipAddress: meta.ipAddress || stored.ipAddress,
    userAgent: meta.userAgent || stored.userAgent,
  });

  return {
    user: buildAuthUser(tenant, "tenant", {
      ownerId: tenant.ownerId.toString(),
      hostelId: tenant.hostelId.toString(),
      roomId: tenant.roomId?.toString() ?? null,
      bedId: tenant.bedId?.toString() ?? null,
    }),
    ...tokens,
  };
}

export async function logoutUser(refreshToken) {
  if (refreshToken) {
    // Mark as non-current (keep for reuse detection) + delete
    await RefreshToken.updateOne({ token: refreshToken }, { isCurrent: false });
    await RefreshToken.deleteOne({ token: refreshToken });
  }
}

/**
 * List all active sessions (current refresh tokens) for a user.
 */
export async function listUserSessions(userId, role) {
  const sessions = await RefreshToken.find({
    userId,
    role,
    isCurrent: true,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .select("family deviceInfo ipAddress userAgent lastUsedAt createdAt expiresAt")
    .lean();

  return sessions.map((s) => ({
    id: s.family,
    device: s.deviceInfo || "Unknown device",
    ipAddress: s.ipAddress || null,
    userAgent: s.userAgent || null,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}

/**
 * Revoke a specific session by family ID.
 */
export async function revokeSession(userId, role, familyId) {
  const result = await RefreshToken.deleteMany({
    userId,
    role,
    family: familyId,
  });
  if (result.deletedCount === 0) {
    throw new AppError("Session not found", 404);
  }
  return { message: "Session revoked" };
}

export async function getMe(userId, role) {
  if (role === "owner" || role === "manager") {
    const user = await Owner.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    let ownerId = user._id;
    let hostelId;
    let hostel;

    if (user.role === "manager") {
      ownerId = user.ownerId;
      hostelId = user.hostelId;
      hostel = await Hostel.findOne({ _id: hostelId, isActive: true });
    } else {
      hostel = await Hostel.findOne({ ownerId: user._id, isActive: true });
      hostelId = hostel?._id;
    }

    return buildAuthUser(user, user.role, {
      ownerId: ownerId.toString(),
      hostelId: hostelId?.toString() ?? null,
      hostelName: hostel?.name || hostel?.hostelName || "",
    });
  }

  return buildTenantProfile(userId);
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

export function getSlaDueAt(priority) {
  const hours = { low: 72, medium: 48, high: 24, emergency: 4 };
  const due = new Date();
  due.setHours(due.getHours() + (hours[priority] ?? 48));
  return due;
}
