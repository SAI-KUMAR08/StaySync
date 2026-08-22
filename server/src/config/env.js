import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().optional(),
  MONGO_URL: z.string().optional(),
  MONGO_DB_NAME: z.string().min(1).default("smart-hostel"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  REFRESH_TOKEN_SECRET: z.string().min(16).optional(),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  // Predefined admin account. Set ADMIN_EMAIL + ADMIN_PASSWORD in Railway env vars.
  // Current testing admin: hostelsrirama@gmail.com
  // Future real admin:     pravitha.555@gmail.com  (switch in Railway when domain is ready)
  ADMIN_EMAIL: z.string().default("hostelsrirama@gmail.com"),
  ADMIN_PASSWORD: z.string().default("Srirama@12345"),
  // Email — OTPs are delivered through Resend. RESEND_API_KEY is optional at
  // startup so the server can boot without an email provider, but any OTP send
  // fails with a clear config error when it is unset (even in development).
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  RUN_MIGRATIONS: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((v) => v === "true" || v === "1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  // Don't process.exit in serverless (Vercel) — let handler return a clear error instead
  if (!process.env.VERCEL) {
    throw new Error("Environment validation failed. Check your .env file.");
  }
}

/** Resolve MONGO_URI from MONGO_URI or fallback MONGO_URL */
function resolveMongoUri(data) {
  if (data?.MONGO_URI && data.MONGO_URI.length > 0) return data.MONGO_URI;
  if (data?.MONGO_URL && data.MONGO_URL.length > 0) {
    console.warn("[env] MONGO_URL is deprecated — rename env var to MONGO_URI");
    return data.MONGO_URL;
  }
  // Last resort: try process.env (Zod fallback path)
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  if (process.env.MONGO_URL) {
    console.warn("[env] MONGO_URL is deprecated — rename env var to MONGO_URI");
    return process.env.MONGO_URL;
  }
  return "";
}

export const env = {
  ...(parsed.success ? parsed.data : process.env),
  MONGO_URI: resolveMongoUri(parsed.success ? parsed.data : process.env),
  REFRESH_TOKEN_SECRET:
    parsed.data?.REFRESH_TOKEN_SECRET || parsed.data?.JWT_SECRET || process.env.JWT_SECRET || "",
  CLIENT_URL: (
    parsed.data?.CLIENT_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, ""),
};

// Fail-closed production gates. Serverless (Vercel) deployments skip these so a
// cold start can surface a clear error through the handler instead of crashing.
if (env.NODE_ENV === "production" && !process.env.VERCEL) {
  // OTPs must be deliverable in production. Real email goes through Resend;
  // without a key the service refuses to start instead of silently printing
  // OTPs to the console (never acceptable in production).
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY must be set in production. OTP emails are delivered through Resend; OTP codes are never logged or echoed when the key is missing."
    );
  }
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error(
      "RESEND_FROM_EMAIL must be set in production (the sender address Resend uses for OTP emails)."
    );
  }

  // Placeholder or missing JWT secrets must never reach production.
  const placeholder = /^your_/i;
  if (!env.JWT_SECRET || placeholder.test(env.JWT_SECRET)) {
    throw new Error(
      "JWT_SECRET must be set to a strong, unique value in production (placeholder secrets are rejected)."
    );
  }

  // Refresh tokens must not fall back to the access-token secret in production.
  if (!process.env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET === env.JWT_SECRET) {
    throw new Error(
      "REFRESH_TOKEN_SECRET must be explicitly set in production. Falling back to JWT_SECRET is not allowed."
    );
  }

  // Warn (don't fail) when the well-known default admin password is still in
  // effect — failing startup would break deployments that rely on the default,
  // but operators must be told the super-admin is using a public credential.
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "Srirama@1234") {
    console.warn(
      "⚠️  ADMIN_PASSWORD is not overridden — the default admin password is active in production. Set a strong ADMIN_PASSWORD in env vars immediately."
    );
  }
}
