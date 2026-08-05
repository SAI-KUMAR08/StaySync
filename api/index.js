import app from "../server/src/app.js";
import { connectDB } from "../server/src/config/db.js";

let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (err) {
      console.error("Vercel DB connection error:", err);
    }
  }
  return app(req, res);
}
