/**
 * API + Socket URLs (Vite env).
 *
 * Development (recommended):
 *   .env.development — leave VITE_API_URL empty → axios uses /api (Vite proxy, no CORS).
 *   VITE_DEV_PROXY_TARGET=https://myhostel-server.onrender.com  (optional remote API)
 *
 * Production:
 *   .env.production — VITE_API_URL=https://myhostel-server.onrender.com
 */

const PRODUCTION_API_FALLBACK = "https://myhostel-server.onrender.com";

function trimEnv(value) {
  return (value ?? "").trim();
}

/**
 * Axios baseURL — ends with `/api`.
 */
export function getAxiosBaseURL() {
  const raw = trimEnv(import.meta.env.VITE_API_URL);

  if (!raw) {
    if (import.meta.env.DEV) {
      return "/api";
    }
    const fallback = PRODUCTION_API_FALLBACK.replace(/\/+$/, "");
    console.warn(
      "[Hostel Manager] VITE_API_URL missing in production; using fallback:",
      fallback
    );
    return `${fallback}/api`;
  }

  const base = raw.replace(/\/+$/, "");
  if (base.endsWith("/api")) return base;
  return `${base}/api`;
}

/**
 * Socket.IO origin (host without /api). In dev with proxy, use current page origin.
 */
export function getSocketOrigin() {
  const raw = trimEnv(import.meta.env.VITE_API_URL);

  if (!raw && import.meta.env.DEV) {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:5173";
  }

  if (!raw) {
    return PRODUCTION_API_FALLBACK.replace(/\/+$/, "").replace(/\/api\/?$/, "");
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
