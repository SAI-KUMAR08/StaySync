import { Owner, Tenant, RefreshToken } from "../../models/index.js";
import { AppError } from "../../middleware/error.middleware.js";
import { verifyRefreshToken, hashRefreshToken } from "../../utils/tokens.js";
import { resolveOwnerHostel, buildAuthUser, buildTenantProfile, issueTokens } from "./helpers.js";

export async function refreshSession(token, meta = {}) {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }

  // Tokens are stored hashed at rest. Look up by hash, with a raw-token fallback
  // so legacy plaintext rows keep working and are migrated to a hash in place.
  const tokenHash = hashRefreshToken(token);
  const stored = await RefreshToken.findOne({ token: { $in: [tokenHash, token] } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError("Refresh token expired", 401);
  }
  if (stored.token === token) {
    stored.token = tokenHash;
    await stored.save();
  }

  // ── Reuse detection ─────────────────────────────────
  // If this token is NOT the current one in its family,
  // someone is trying to reuse an old rotated token.
  if (!stored.isCurrent) {
    // Invalidate ALL tokens in this family (attacker + legitimate user)
    await RefreshToken.deleteMany({ userId: stored.userId, family: stored.family });
    throw new AppError("Session compromised. Please log in again.", 401);
  }

  if (decoded.role === "owner") {
    const user = await Owner.findById(decoded.sub);
    if (!user?.isActive) throw new AppError("User inactive", 401);

    const { ownerId, hostelId, hostel } = await resolveOwnerHostel(user);
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

  // Same shape as login/getMe — includes hostelName + roomDetails.
  const profile = await buildTenantProfile(tenant);

  return {
    user: profile,
    ...tokens,
  };
}

export async function logoutUser(refreshToken) {
  if (refreshToken) {
    // Look up by hash (or legacy raw value), then mark non-current + delete.
    const tokenHash = hashRefreshToken(refreshToken);
    const match = { token: { $in: [tokenHash, refreshToken] } };
    await RefreshToken.updateOne(match, { isCurrent: false });
    await RefreshToken.deleteOne(match);
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
  if (role === "owner") {
    const user = await Owner.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const { ownerId, hostelId, hostel } = await resolveOwnerHostel(user);

    return buildAuthUser(user, user.role, {
      ownerId: ownerId.toString(),
      hostelId: hostelId?.toString() ?? null,
      hostelName: hostel?.name || hostel?.hostelName || "",
    });
  }

  return buildTenantProfile(userId);
}

export function getSlaDueAt(priority) {
  const hours = { low: 72, medium: 48, high: 24, emergency: 4 };
  const due = new Date();
  due.setHours(due.getHours() + (hours[priority] ?? 48));
  return due;
}
