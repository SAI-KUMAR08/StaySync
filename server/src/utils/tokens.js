import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Access tokens are short-lived (15m); clients transparently refresh via /auth/refresh.
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "30d";

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET, { algorithms: ["HS256"] });
}

/**
 * One-way hash of a refresh token, stored at rest instead of the raw 30-day
 * bearer credential — a DB read can no longer mint sessions.
 */
export function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
