import mongoose from "mongoose";
import app from "../server/src/app.js";

// ── Global connection cache for serverless cold-start reduction ──
let connected = false;

/**
 * Quick DB check — returns true if Mongoose is connected.
 * Fails fast and leaves Express to serve a 503.
 */
async function ensureDb() {
  if (connected && mongoose.connection.readyState === 1) return true;

  // Grab MONGO_URI — must be set as a Vercel environment variable
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB_NAME || "smart-hostel";

  if (!uri) {
    console.error("[Vercel] MONGO_URI is NOT set in Vercel environment variables.");
    console.error("[Vercel] Go to https://vercel.com/~/projects/stay-sync/settings/environment-variables");
    console.error("[Vercel] Add MONGO_URI with your MongoDB Atlas connection string.");
    return false;
  }

  // Sanity — don't log full URI (security), just prefix
  const safePrefix = uri.replace(/\/\/.+@/, "//user:****@");
  console.log(`[Vercel] Connecting to MongoDB at ${safePrefix} db=${dbName}`);

  try {
    // Use short timeout & disable buffering so failed queries surface
    // immediately as 503, not after 10s silent timeout
    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      retryWrites: true,
      family: 4,
      bufferCommands: false,
    });
    connected = true;
    console.log("[Vercel] MongoDB connected");
    return true;
  } catch (err) {
    console.error("[Vercel] MongoDB connection failed:", err.message);
    console.error("[Vercel] Troubleshooting:");
    console.error("[Vercel]   1. MONGO_URI value is correct in Vercel env vars?");
    console.error("[Vercel]   2. Atlas cluster is ACTIVE (not paused)?");
    console.error("[Vercel]   3. Network Access has 0.0.0.0/0 allowed?");
    console.error("[Vercel]   4. Password in URI doesn't contain special chars (@ : /) needing URL-encoding?");
    return false;
  }
}

// Mount a dummy Socket.IO so app.get("io") doesn't crash
const { EventEmitter } = await import("events");
const dummyIo = new EventEmitter();
dummyIo.to = () => dummyIo;
dummyIo.in = () => dummyIo;
dummyIo.emit = () => dummyIo;
dummyIo.server = null;
dummyIo.sockets = { join: () => {}, leave: () => {} };
app.set("io", dummyIo);

// Vercel serverless handler
export default async function handler(req, res) {
  const dbOk = await ensureDb();
  if (!dbOk) {
    return res.status(503).json({
      success: false,
      message: "Database unavailable. Check Vercel environment variables (MONGO_URI).",
    });
  }
  return app(req, res);
}
