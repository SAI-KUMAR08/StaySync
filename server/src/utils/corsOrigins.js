/**
 * Browser + Socket.IO CORS allowlist.
 *
 * Render production — set in API service env:
 *   CLIENT_URL=https://my-hostel-client.vercel.app
 *   CLIENT_URLS=https://preview.vercel.app,https://www.myhostel.com
 *
 * Local dev (localhost:5173, localhost:3000) is always allowed so you can test against a deployed API.
 */

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:3000",
];

const DEPLOYED_FRONTENDS = [
  "https://my-hostel-client.vercel.app",
  "https://hostel-frountend.vercel.app",
  "https://hostel-frontend.vercel.app",
];

export function getAllowedCorsOrigins() {
  const fromEnv = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    ...(process.env.CLIENT_URLS?.split(",").map((s) => s.trim()) ?? []),
    ...(process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
  ]
    .filter(Boolean)
    .map((url) => url.replace(/\/+$/, ""));

  return [...new Set([...fromEnv, ...DEPLOYED_FRONTENDS, ...LOCAL_DEV_ORIGINS])];
}

export function isLocalDevOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
}

export function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  if (allowed.includes(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
  return false;
}

/** Express CORS origin callback — credentials-safe allowlist */
export function corsOriginDelegate(origin, callback) {
  if (!origin || isOriginAllowed(origin)) {
    return callback(null, true);
  }

  console.warn(
    `[CORS] Blocked origin: ${origin || "(none)"}. Allowed: ${getAllowedCorsOrigins().join(", ")}`
  );
  return callback(new Error("CORS blocked"));
}

/** Apply CORS headers on error responses (preflight / 5xx must still include ACAO) */
export function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
}
