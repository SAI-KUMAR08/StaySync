import crypto from "crypto";
import { Hostel, Tenant, RefreshToken, OTP } from "../../models/index.js";
import { signAccessToken, signRefreshToken, hashRefreshToken } from "../../utils/tokens.js";
import { AppError } from "../../middleware/error.middleware.js";
import { OTP_CONFIG, TOKEN, IP_FAILURE } from "../../utils/constants.js";

/**
 * Shared helpers for the auth service modules (ownerAuth / tenantAuth / sessions).
 */

/**
 * Verify an OTP code for a given user. Marks the OTP as verified on success.
 * Throws AppError with appropriate message on failure (missing, invalid, expired).
 *
 * Brute-force guard: every wrong/expired guess increments `failedAttempts`;
 * at MAX_ATTEMPTS the OTP is invalidated (verified=true) so the user must
 * request a fresh code. Error messages are unchanged.
 */
export async function verifyOTP(userId, otp) {
  const otpDoc = await OTP.findOne({ userId, verified: false }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new AppError("OTP session not found. Please request a new OTP.", 404);
  }

  const storedOk = otpDoc.otp === otp && otpDoc.expiresAt >= new Date();

  if (!storedOk) {
    const nextCount = (otpDoc.failedAttempts || 0) + 1;
    const update = { $inc: { failedAttempts: 1 } };
    if (nextCount >= OTP_CONFIG.MAX_ATTEMPTS) {
      update.verified = true; // invalidate — force the user to request a new OTP
    }
    await OTP.updateOne({ _id: otpDoc._id }, update);
    throw new AppError("Invalid or expired OTP", 401);
  }

  otpDoc.verified = true;
  await otpDoc.save();
  return otpDoc;
}

// ── Per-(account+IP) failure tracking ─────────────────────────────────────
// Prevents an unauthenticated attacker from locking out a real account by
// hammering the password endpoint from one IP: once a single IP exceeds the
// threshold for a given account, further attempts are rejected (429) WITHOUT
// touching the persistent account lockout counter. Entries expire after the
// window and the map is pruned when it grows large, so memory stays bounded.
const ipFailureMap = new Map(); // key: `${accountId}:${ip}` → { count, lastAt }
const IP_FAILURE_MAP_MAX = 5000;

function pruneIpFailureMap(now) {
  if (ipFailureMap.size < IP_FAILURE_MAP_MAX) return;
  for (const [key, entry] of ipFailureMap) {
    if (now - entry.lastAt > IP_FAILURE.WINDOW_MS) ipFailureMap.delete(key);
  }
}

/** Record a failed password attempt for (account, IP). Call BEFORE the rate check. */
export function recordIpFailure(accountId, ip) {
  if (!ip || !accountId) return;
  const key = `${accountId}:${ip}`;
  const now = Date.now();
  const entry = ipFailureMap.get(key);
  if (entry && now - entry.lastAt <= IP_FAILURE.WINDOW_MS) {
    entry.count += 1;
    entry.lastAt = now;
  } else {
    ipFailureMap.set(key, { count: 1, lastAt: now });
  }
  pruneIpFailureMap(now);
}

/** Throw 429 if (account, IP) has exceeded the failure threshold in the window. */
export function checkIpFailureRate(accountId, ip) {
  if (!ip || !accountId) return;
  const entry = ipFailureMap.get(`${accountId}:${ip}`);
  if (entry && entry.count >= IP_FAILURE.MAX) {
    throw new AppError(
      "Too many failed attempts from this device. Please try again in 15 minutes.",
      429
    );
  }
}

/** Clear the failure entry after a successful login. */
export function clearIpFailures(accountId, ip) {
  if (!ip || !accountId) return;
  ipFailureMap.delete(`${accountId}:${ip}`);
}

/**
 * Resolve ownerId, hostelId, and hostel for an owner user.
 * Auto-creates a default hostel if none exists.
 */
export async function resolveOwnerHostel(user) {
  let hostel = await Hostel.findOne({ ownerId: user._id, isActive: true });
  if (!hostel) {
    hostel = await Hostel.create({
      ownerId: user._id,
      name: "My Hostel",
      address: "",
      city: "",
      isActive: true,
    });
  }
  return { ownerId: user._id, hostelId: hostel._id, hostel };
}

/** Check if the OTP cooldown is still active for this user. Throws if too soon. */
export async function checkOtpCooldown(userId) {
  const latestOtp = await OTP.findOne({ userId }).sort({ createdAt: -1 });
  if (latestOtp && Date.now() - latestOtp.createdAt.getTime() < OTP_CONFIG.COOLDOWN_MS) {
    throw new AppError("Please wait 15 seconds before requesting a new OTP.", 429);
  }
}

/** Generate a new OTP value and expiry (10 min from now) */
export function generateOtp() {
  return {
    otpVal: crypto.randomInt(OTP_CONFIG.MIN, OTP_CONFIG.MAX).toString(),
    expiresAt: new Date(Date.now() + OTP_CONFIG.EXPIRY_MS),
  };
}

export function buildAuthUser(entity, role, extra = {}) {
  return {
    id: entity._id.toString(),
    name: entity.name || entity.personalInfo?.name || "",
    email: entity.email || entity.personalInfo?.email || "",
    phone: entity.phone || entity.personalInfo?.phone || "",
    role,
    ...extra,
  };
}

export async function buildTenantProfile(tenantOrId) {
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
      floorId: { number: tenant.floorId?.floorNumber ?? "—" },
      bedId: { number: tenant.bedId?.bedNumber ?? "—" },
    },
  };
}

/**
 * Issue a new access/refresh token pair, storing the refresh token in the
 * RefreshToken collection (with family-based rotation).
 */
export async function issueTokens(
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
  const expiresAt = new Date(Date.now() + TOKEN.REFRESH_LIFETIME_MS);

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
    token: hashRefreshToken(refreshToken),
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
