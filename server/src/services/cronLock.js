import { CronLock } from "../models/index.js";

/**
 * Run `fn` under an atomic MongoDB lock so overlapping cron executions can't
 * happen (e.g. multiple serverless instances firing the same schedule).
 *
 * - First caller inserts the lock document (unique index on `name`).
 * - A lock whose `expiresAt` has passed is taken over (stuck-lock recovery).
 * - Returns `null` when the lock is already held by another run.
 */
export async function withCronLock(name, ttlMs, fn) {
  const expiresAt = new Date(Date.now() + ttlMs);
  let acquired = false;

  try {
    await CronLock.findOneAndUpdate(
      { name, expiresAt: { $lte: new Date() } },
      { $set: { expiresAt } },
      { upsert: true, new: true }
    );
    acquired = true;
  } catch (err) {
    // Unique-index violation → the lock already exists and is still held.
    if (err?.code !== 11000) throw err;
  }

  if (!acquired) {
    console.warn(`[cron-lock] Skipping "${name}" — another run is in progress.`);
    return null;
  }

  try {
    return await fn();
  } finally {
    // Best-effort release; if this fails the lock simply expires via ttlMs.
    // Match on the exact expiresAt this run set so an overrun instance can't
    // delete a successor's lock.
    await CronLock.deleteOne({ name, expiresAt }).catch(() => {});
  }
}
