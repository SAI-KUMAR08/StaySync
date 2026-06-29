/**
 * API + Socket URLs (Vite env).
 *
 * Development:
 *   Vite proxy forwards /api to the backend (defined in vite.config.js).
 *
 * Production (Vercel full-stack):
 *   Both frontend and API live on the same domain, so /api is relative.
 *
 * External backend (optional):
 *   Set VITE_API_URL=https://your-api.com to override.
 */

const PRODUCTION_API_FALLBACK = ""; // empty = same-domain /api

function trimEnv(value) {
  return (value ?? "").trim();
}

/**
 * Axios baseURL — ends with `/api`.
 */
export function getAxiosBaseURL() {
  const raw = trimEnv(import.meta.env.VITE_API_URL);

  if (!raw) {
    return "/api";
  }

  const base = raw.replace(/\/+$/, "");
  if (base.endsWith("/api")) return base;
  return `${base}/api`;
}

/**
 * Socket.IO origin (host without /api).
 */
export function getSocketOrigin() {
  const raw = trimEnv(import.meta.env.VITE_API_URL);

  if (!raw) {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:5173";
  }

  const normalized = raw.replace(/\/+$/, "");
  if (normalized.endsWith("/api")) {
    return normalized.slice(0, -4);
  }
  try {
    return new URL(normalized).origin;
  } catch {
    return normalized;
  }
}
