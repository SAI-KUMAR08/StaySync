import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  MONGO_DB_NAME: z.string().min(1).default("smart-hostel"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  REFRESH_TOKEN_SECRET: z.string().min(16).optional(),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  REFRESH_TOKEN_SECRET: parsed.data.REFRESH_TOKEN_SECRET || parsed.data.JWT_SECRET,
  CLIENT_URL: parsed.data.CLIENT_URL.replace(/\/$/, ""),
};
