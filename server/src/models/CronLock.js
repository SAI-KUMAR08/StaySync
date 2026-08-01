import mongoose from "mongoose";

/**
 * Distributed lock document for cron jobs.
 * `name` is unique; `expiresAt` lets a stuck lock auto-expire so the job
 * can recover on the next run instead of being blocked forever.
 */
const cronLockSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

export const CronLock = mongoose.model("CronLock", cronLockSchema);
