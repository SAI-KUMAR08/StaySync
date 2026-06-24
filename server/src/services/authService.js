import mongoose from "mongoose";
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
        { path: "floorId", select: "name level" },
        { path: "roomId", select: "roomNumber floor" },
        { path: "bedId", select: "bedLabel" },
      ]);
    }
  } else {
    tenant = await Tenant.findById(tenantOrId)
      .populate("floorId", "name level")
      .populate("roomId", "roomNumber floor")
      .populate("bedId", "bedLabel");
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
          hostelName: hostelName.trim(),
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

  const otpVal = isMockOtp() ? DEMO_OTP : String(Math.floor(100000 + Math.random() * 900000));
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


export async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await Owner.findOne({ email: normalizedEmail, isActive: true }).select("+password");
  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const valid = await user.comparePassword(password);
  if (!valid) throw new AppError("Invalid credentials", 401);

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

  const otpVal = isMockOtp() ? DEMO_OTP : String(Math.floor(100000 + Math.random() * 900000));
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

export async function verifyTenantOtp({ phone, otp }) {
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
  });

  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}


async function issueTokens(user, role, { ownerId, hostelId }) {
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
  await RefreshToken.create({
    userId: user._id,
    role,
    token: refreshToken,
    expiresAt,
    ownerId,
    hostelId,
  });

  return { accessToken, refreshToken };
}

export async function refreshSession(token) {
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

    await RefreshToken.deleteOne({ token });
    const tokens = await issueTokens(user, user.role, {
      ownerId,
      hostelId,
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

  await RefreshToken.deleteOne({ token });
  const tokens = await issueTokens(tenant, "tenant", {
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
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
    await RefreshToken.deleteOne({ token: refreshToken });
  }
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
