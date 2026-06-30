import mongoose from "mongoose";
import app from "../server/src/app.js";

// ── Global connection cache for serverless cold-start reduction ──
let connected = false;

/**
 * Quick DB check — returns true if Mongoose is connected.
 * Does NOT retry; fails fast and leaves Express to serve a 503.
 */
async function ensureDb() {
  if (connected) return true;
  try {
    // Start connection with short timeout & disable buffering
    // so failed queries surface immediately as 503, not after 10s silent timeout
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || "smart-hostel",
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
    console.error("[Vercel] Ensure the cluster IP is whitelisted (try 0.0.0.0/0)");
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
      message: "Database unavailable. Check MongoDB Atlas IP whitelist (see server logs).",
    });
  }
  return app(req, res);
}
