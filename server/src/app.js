import crypto from "crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import { isIP } from "net";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";
import { corsOriginDelegate } from "./utils/corsOrigins.js";
import { env } from "./config/env.js";

const app = express();

// Render / reverse proxies (required for correct IPs + secure cookies)
app.set("trust proxy", 1);

// ── Request ID tracking ───────────────────────────────────
// Every request gets an ID (client-provided or generated) surfaced in the
// response header and in every log line + error report.
app.use((req, res, next) => {
  // Client-supplied request IDs are log-unsafe — strip CR/LF (log injection).
  const headerId = req.headers["x-request-id"];
  req.id = headerId
    ? String(headerId).replace(/[\r\n]/g, "") || crypto.randomUUID()
    : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// ── X-Forwarded-For validation ────────────────────────────
// With `trust proxy 1`, Express reads the RIGHTMOST hop of X-Forwarded-For as
// the client address (the hop appended by the trusted reverse proxy). Garbage
// or attacker-prefixed leading hops must be dropped; only the rightmost
// well-formed IP is kept. If the rightmost hop is malformed, the header is
// deleted so Express falls back to the socket address.
function sanitizeForwardedFor(req, res, next) {
  const header = req.headers["x-forwarded-for"];
  if (header === undefined) return next();

  const hops = (Array.isArray(header) ? header : String(header).split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);

  const rightmost = hops[hops.length - 1];
  if (!rightmost || isIP(rightmost) === 0) {
    delete req.headers["x-forwarded-for"];
  } else {
    req.headers["x-forwarded-for"] = rightmost;
  }
  next();
}

// ── HTTP Parameter Pollution protection ───────────────────
// Collapse duplicate query params (last value wins). No route in this app
// consumes array query params, so this cannot change API behavior.
function hppProtection(req, res, next) {
  const query = req.query;
  for (const key of Object.keys(query)) {
    if (Array.isArray(query[key])) {
      query[key] = query[key][query[key].length - 1];
    }
  }
  next();
}

// CORS Whitelist Configuration
const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: [],
  maxAge: 86400, // 24h — cache preflight
};

// 1. CORS (global middleware — handles preflight automatically)
app.use(cors(corsOptions));

// 2. Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", env.CLIENT_URL],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// 3. Compression
app.use(compression());

// ── HTTP logger (sanitized + request ID + response time) ──
const SENSITIVE_QUERY_KEYS = [
  "token",
  "access_token",
  "refresh_token",
  "password",
  "otp",
  "secret",
  "key",
  "api_key",
  "apikey",
  "code",
];

function sanitizeUrl(url) {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return url;
  const path = url.slice(0, qIndex);
  const search = url.slice(qIndex + 1);
  try {
    const params = new URLSearchParams(search);
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (params.has(key)) params.set(key, "[REDACTED]");
    }
    const clean = params.toString();
    return clean ? `${path}?${clean}` : path;
  } catch {
    return `${path}?[redacted]`;
  }
}

morgan.token("req-id", (req) => req.id || "-");
morgan.token("safe-url", (req) => sanitizeUrl(req.originalUrl || ""));
// The user-agent is attacker-controlled and lands in log files — strip CR/LF.
morgan.token("safe-user-agent", (req) => {
  const ua = req.headers["user-agent"];
  return ua ? String(ua).replace(/[\r\n]/g, "") : "-";
});

const morganFormat =
  process.env.NODE_ENV === "production"
    ? ":remote-addr - :req-id - :method :safe-url :status :response-time ms - :safe-user-agent"
    : ":req-id - :method :safe-url :status :response-time ms";

// Validate X-Forwarded-For BEFORE morgan logs it, so the access log records the
// sanitized (rightmost well-formed) IP rather than an attacker-forged hop.
app.use(sanitizeForwardedFor);
app.use(morgan(morganFormat));

// 4. Express Body Parser (size-limited to prevent oversized-payload DoS)
// Tenant create/update routes carry base64 photo/PDF document data URLs that
// exceed the default 1 MB cap. A larger parser is scoped to just those paths;
// the default stays tight everywhere else. (Parsed bodies are capped again by
// the server-side doc MIME/size validator in validators/resources.js.)
app.use("/api/owner/tenants", express.json({ limit: "10mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 5. Cookie Parser
app.use(cookieParser());

app.use(hppProtection);

app.use(mongoSanitize());

// Root Endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MyHostel API",
    health: "/api/health",
  });
});

// 6. Routes
app.use("/api", routes);
app.use("/", routes);

// 7. Error Middleware
app.use(errorHandler);

export default app;
