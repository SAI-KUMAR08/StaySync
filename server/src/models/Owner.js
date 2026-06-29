import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    role: { type: String, enum: ["owner", "manager"], default: "owner" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", default: null, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null, index: true },
    isActive: { type: Boolean, default: true },
    // ── Account lockout ─────────────────────────────────
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    // ── Email verification ──────────────────────────────
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// ── Index for lockout queries ────────────────────────────
ownerSchema.index({ loginAttempts: 1, lockUntil: 1 });

// ── Pre-save: hash password ──────────────────────────────
ownerSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// ── Instance methods ─────────────────────────────────────

ownerSchema.methods.comparePassword = function compare(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * Check if the account is currently locked due to failed attempts.
 */
ownerSchema.methods.isLocked = function isLocked() {
  return this.lockUntil && this.lockUntil > new Date();
};

/**
 * Increment failed login attempts.
 * Locks the account for 15 minutes after 5 consecutive failures.
 */
ownerSchema.methods.incrementLoginAttempts = async function incrementLoginAttempts() {
  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
  }
  await this.save();
};

/**
 * Reset login attempts on successful login.
 */
ownerSchema.methods.resetLoginAttempts = async function resetLoginAttempts() {
  this.loginAttempts = 0;
  this.lockUntil = null;
  await this.save();
};

// ── Virtuals ─────────────────────────────────────────────
ownerSchema.virtual("hostels", {
  ref: "Hostel",
  localField: "_id",
  foreignField: "ownerId",
});

ownerSchema.set("toJSON", { virtuals: true });
ownerSchema.set("toObject", { virtuals: true });

export const Owner = mongoose.model("Owner", ownerSchema);

