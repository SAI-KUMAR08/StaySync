import mongoose from "mongoose";
import crypto from "crypto";

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["owner", "manager", "tenant"], required: true },
    token: { type: String, required: true, unique: true },
    // ── Token family for rotation & reuse detection ──────
    family: { type: String, required: true, index: true },
    // Is this token the current (valid) token in its family?
    isCurrent: { type: Boolean, default: true, index: true },
    // Previous token hash — links to the token this one replaced
    previousTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    // ── Session metadata ─────────────────────────────────
    deviceInfo: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, index: true },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, family: 1 });
refreshTokenSchema.index({ userId: 1, isCurrent: 1 });

/**
 * Generate a cryptographically random family ID.
 */
refreshTokenSchema.statics.generateFamily = function () {
  return crypto.randomBytes(24).toString("hex");
};

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
