import { verifyAccessToken } from "../utils/tokens.js";
import { AppError } from "./error.middleware.js";
import { hasPermission } from "../config/permissions.js";

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.userId || decoded.sub,
      role: decoded.role,
      email: decoded.email,
      ownerId: decoded.ownerId,
      hostelId: decoded.hostelId,
    };
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

/**
 * Role-based authorization gate.
 * Checks that the authenticated user has one of the allowed roles.
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };
}

/**
 * Permission-based authorization gate.
 * Checks that the authenticated user's role grants the specified permission.
 *
 * Usage:
 *   router.get("/tenants", requirePermission("read:tenants"), handler);
 *   router.delete("/expenses/:id", requirePermission("delete:expenses"), handler);
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return next(new AppError("Forbidden: insufficient permissions", 403));
    }
    next();
  };
}

export function tenantScope(req, res, next) {
  if (req.user.role !== "tenant") return next();
  req.tenantFilter = {
    ownerId: req.user.ownerId,
    hostelId: req.user.hostelId,
    tenantId: req.user.id,
  };
  next();
}

export function ownerScope(req, res, next) {
  if (req.user.role !== "owner" && req.user.role !== "manager") return next();
  req.ownerFilter = {
    ownerId: req.user.role === "manager" ? req.user.ownerId : req.user.id,
    hostelId: req.user.hostelId,
  };
  next();
}
