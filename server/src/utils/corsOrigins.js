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
  "https://stay-sync-git-main-code-catalist.vercel.app",
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

/**
 * Vercel preview deploys get a new subdomain on every push, so they can't be
 * enumerated. We only accept preview subdomains of THIS app's own Vercel
 * projects (project name is the prefix of the preview URL) — arbitrary
 * *.vercel.app origins are blocked.
 */
const VERCEL_PROJECT_PREFIXES = [
  "my-hostel-client",
  "hostel-frontend",
  "hostel-frountend",
  "stay-sync-git-main-code-catalist",
];

// Vercel preview URLs always end in a deployment hash: `<branch>-<7+ char
// lowercase-alphanumeric hash>`. Requiring that final segment blocks squatted
// names like `my-hostel-client-evil.vercel.app` while allowing genuine previews
// such as `my-hostel-client-git-main-abc12345`.
const VERCEL_PREVIEW_HASH = /^([a-z0-9-]*)-([a-z0-9]{7,})$/;

function isVercelPreviewOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (!hostname.endsWith(".vercel.app")) return false;
    const base = hostname.slice(0, -".vercel.app".length);
    return VERCEL_PROJECT_PREFIXES.some((p) => {
      if (base === p) return true;
      if (!base.startsWith(`${p}-`)) return false;
      return VERCEL_PREVIEW_HASH.test(base.slice(p.length + 1));
    });
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  if (allowed.includes(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
  if (isVercelPreviewOrigin(origin)) return true;
  return false;
}

/** Express CORS origin callback — credentials-safe allowlist */
export function corsOriginDelegate(origin, callback) {
  if (!origin || isOriginAllowed(origin)) {
    return callback(null, true);
  }

  console.warn(
    `[CORS] Blocked origin: ${origin || "(none)"}. Allowed: ${getAllowedCorsOrigins().join(", ")}` +
      ` | Set CLIENT_URL or CLIENT_URLS env var on the server to add this origin.`
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

/** Log CORS config at startup */
(function logCorsConfig() {
  const origins = getAllowedCorsOrigins();
  const vercelPreviews = origins.some((o) => o.includes(".vercel.app"));
  console.log(
    `[CORS] ${origins.length} origin(s) configured` +
      (vercelPreviews ? ` + own-project vercel previews (deployment-hash only)` : "") +
      ` | ${origins.slice(0, 3).join(", ")}${origins.length > 3 ? `…` : ""}`
  );
})();
