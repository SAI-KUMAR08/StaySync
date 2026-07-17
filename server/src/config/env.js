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
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // SMTP — email delivery for OTPs
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SEND_REAL_EMAIL: z
    .enum(["true", "false", "1", "0"])
    .default("false")
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
  REFRESH_TOKEN_SECRET: parsed.data?.REFRESH_TOKEN_SECRET || parsed.data?.JWT_SECRET || process.env.JWT_SECRET || "",
  CLIENT_URL: (parsed.data?.CLIENT_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, ""),
};

// Warn about placeholder secrets in production
if (env.NODE_ENV === "production") {
  const placeholder = /^your_/i;
  if (placeholder.test(env.JWT_SECRET)) {
    console.error("[env] ⚠️ JWT_SECRET appears to be a placeholder! Set a strong, unique secret for production.");
  }
  if (!process.env.REFRESH_TOKEN_SECRET && env.REFRESH_TOKEN_SECRET === env.JWT_SECRET) {
    console.warn("[env] ⚠️ REFRESH_TOKEN_SECRET is not set — falling back to JWT_SECRET. Set a separate REFRESH_TOKEN_SECRET for better security.");
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.warn("[env] ⚠️ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured. Online payments will not work.");
  }
}
