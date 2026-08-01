import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import * as authService from "../services/authService.js";
import { Owner, Tenant, RefreshToken } from "../models/index.js";
import { AppError } from "../middleware/error.middleware.js";
import { TOKEN } from "../utils/constants.js";
import { isOriginAllowed } from "../utils/corsOrigins.js";

const isProduction = process.env.NODE_ENV === "production";

/**
 * SameSite=None cookies are sent cross-site, so a state-changing cookie-based
 * endpoint must reject requests carrying an Origin that isn't on the CORS
 * allowlist (closes a token-rotation/logout CSRF window). Requests with no
 * Origin (curl, mobile, same-origin navigation) are unaffected.
 */
function assertAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) throw new AppError("Forbidden", 403);
}

/**
 * Extract device/client metadata from the request.
 */
function getClientMeta(req) {
  return {
    deviceInfo: req.headers["x-device-info"] || req.headers["user-agent"]?.slice(0, 200) || null,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers["user-agent"]?.slice(0, 500) || null,
  };
}

/** Set httpOnly refresh token cookie on the response */
function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    maxAge: TOKEN.REFRESH_LIFETIME_MS, // must match the refresh token's own 30d expiry
  });
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerOwner(req.validated.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result, 201);
});

export const sendOwnerOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendOwnerOtp(req.validated.body);
  return success(res, result);
});

export const verifyOwnerOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOwnerOtpAndRegister(req.validated.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const sendOwnerLoginOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendOwnerLoginOtp(req.validated.body);
  return success(res, result);
});

export const verifyOwnerLoginOtp = asyncHandler(async (req, res) => {
  const meta = getClientMeta(req);
  const result = await authService.verifyOwnerLoginOtp(req.validated.body, meta);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const login = asyncHandler(async (req, res) => {
  const meta = getClientMeta(req);
  const result = await authService.loginUser(req.validated.body, meta);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const sendOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendTenantOtp(req.validated.body);
  return success(res, result);
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const meta = getClientMeta(req);
  const result = await authService.verifyTenantOtp(req.validated.body, meta);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const checkTenantStatus = asyncHandler(async (req, res) => {
  const result = await authService.checkTenantStatus(req.validated.body);
  return success(res, result);
});

export const tenantLogin = asyncHandler(async (req, res) => {
  const meta = getClientMeta(req);
  const result = await authService.loginTenantWithPassword(req.validated.body, meta);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const tenantSetPassword = asyncHandler(async (req, res) => {
  const result = await authService.setTenantPassword(req.validated.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const tenantSetInitialPassword = asyncHandler(async (req, res) => {
  const result = await authService.setInitialTenantPassword(req.validated.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const sendForgotOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendTenantForgotOtp(req.validated.body);
  return success(res, result);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetTenantPassword(req.validated.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const sendOwnerForgotOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendOwnerForgotOtp(req.validated.body);
  return success(res, result);
});

export const resetOwnerPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetOwnerPassword(req.validated.body);
  return success(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  assertAllowedOrigin(req);
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) throw new AppError("Refresh token required", 401);
  const meta = getClientMeta(req);
  const result = await authService.refreshSession(token, meta);
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  assertAllowedOrigin(req);
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  await authService.logoutUser(token);
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
  });
  return success(res, { message: "Logged out" });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id, req.user.role);
  return success(res, user);
});

export const switchHostel = asyncHandler(async (req, res) => {
  if (req.user.role !== "owner") throw new AppError("Forbidden", 403);
  const result = await authService.switchOwnerHostel({
    ownerId: req.user.id,
    hostelId: req.validated.body.hostelId,
  });
  setRefreshCookie(res, result.refreshToken);
  return success(res, result);
});

export const updateProfile = asyncHandler(async (req, res) => {
  // Tenant profile changes MUST go through the admin-reviewed profile-request
  // workflow (POST /tenant/profile-request). A tenant can no longer write their
  // own name/phone/email directly to the database.
  if (req.user.role === "tenant") {
    throw new AppError("Profile changes must be submitted for admin approval.", 403);
  }

  const { name, phone, email } = req.validated.body;
  const isTenant = false;
  const Model = Owner;
  const query = isTenant
    ? { _id: req.user.id, ownerId: req.user.ownerId, hostelId: req.user.hostelId }
    : { _id: req.user.id };

  const user = await Model.findOne(query);
  if (!user) throw new AppError("User not found", 404);

  // Resolve the effective email for comparison (Tenant uses personalInfo subdoc)
  const currentEmail = isTenant ? user.personalInfo?.email : user.email;

  if (email && email.toLowerCase() !== currentEmail) {
    const normalized = email.trim().toLowerCase();
    const ownerClash = await Owner.findOne({ email: normalized });
    if (ownerClash) throw new AppError("Email already in use", 409);

    const clashQuery = isTenant
      ? {
          "personalInfo.email": normalized,
          ownerId: req.user.ownerId,
          hostelId: req.user.hostelId,
          _id: { $ne: user._id },
        }
      : { "personalInfo.email": normalized };
    const tenantClash = await Tenant.findOne(clashQuery);
    if (tenantClash) throw new AppError("Email already in use", 409);

    if (isTenant) {
      user.personalInfo.email = normalized;
    } else {
      user.email = normalized;
    }
  }
  if (name) {
    if (isTenant) {
      user.personalInfo.name = name.trim();
    } else {
      user.name = name.trim();
    }
  }
  if (phone !== undefined) {
    const cleaned = phone?.trim();
    if (isTenant) {
      user.personalInfo.phone = cleaned;
    } else {
      user.phone = cleaned;
    }
  }
  await user.save();

  const updated = await authService.getMe(req.user.id, req.user.role);
  return success(res, updated);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;
  const isTenant = req.user.role === "tenant";
  const Model = isTenant ? Tenant : Owner;
  // Tenant stores the password at personalInfo.password (select:false) — selecting
  // only the top-level `password` path made comparePassword always fail for tenants.
  const user = await Model.findById(req.user.id).select(
    isTenant ? "+personalInfo.password" : "+password"
  );
  if (!user) throw new AppError("User not found", 404);

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new AppError("Current password is incorrect", 400);

  if (isTenant) {
    user.personalInfo.password = newPassword;
  } else {
    user.password = newPassword;
  }
  await user.save();

  // Revoke all existing sessions — the user must log in again on every device.
  await RefreshToken.deleteMany({ userId: user._id });

  return success(res, { message: "Password updated successfully" });
});

// ── Session management ─────────────────────────────────

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.listUserSessions(req.user.id, req.user.role);
  return success(res, { sessions });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const result = await authService.revokeSession(req.user.id, req.user.role, familyId);
  return success(res, result);
});
