import app from "../server/src/app.js";
import { connectDB } from "../server/src/config/db.js";

// Global connection cache for serverless cold-start reduction
let cachedDb = null;

async function ensureDb() {
  if (cachedDb) return cachedDb;
  try {
    const conn = await connectDB();
    cachedDb = conn;
    console.log("[Vercel] MongoDB connected");
  } catch (err) {
    console.error("[Vercel] MongoDB connection failed:", err.message);
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
  await ensureDb();
  return app(req, res);
}
