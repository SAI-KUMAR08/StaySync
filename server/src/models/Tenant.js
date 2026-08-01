import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ACCOUNT } from "../utils/constants.js";

const tenantSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },

    personalInfo: {
      name: { type: String, required: true, trim: true, alias: "name" },
      email: { type: String, lowercase: true, trim: true, default: "", alias: "email" },
      phone: { type: String, required: true, trim: true, alias: "phone" },
      password: { type: String, select: false, alias: "password" },
    },

    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    role: { type: String, enum: ["tenant"], default: "tenant" },

    // A tenant must always belong to Hostel -> Floor -> Room -> Bed while active.
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", default: null },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null },

    monthlyRent: { type: Number, default: 0, min: 0 },
    address: { type: String, trim: true, default: "" },
    emergencyContact: { type: String, trim: true },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "overdue", "partial"],
      default: "unpaid",
    },
    moveInDate: { type: Date, default: Date.now, alias: "joinDate" },
    moveOutDate: { type: Date, default: null },
    verificationStatus: { type: String, enum: ["pending", "verified"], default: "verified" },

    idProof: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isTemporary: { type: Boolean, default: false },
    doesPassCreated: { type: Boolean, default: false },
    preferredSharing: { type: Number, default: null },
    temporaryAllotmentDate: { type: Date, default: null },
    permanentTargetBedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null },

    // ── Security Deposit ────────────────────────────────
    isSecurityDepositPaid: { type: Boolean, default: false },
    securityDepositAmount: { type: Number, default: 0, min: 0 },
    securityDepositDate: { type: Date, default: null },

    // ── Identity & Documents ────────────────────────────
    aadhaarNumber: { type: String, trim: true, default: null },
    offlineBookingForm: { type: String, trim: true, default: null }, // URL to uploaded file

    // ── Scheduled Cleanup ───────────────────────────────
    scheduledDeletionDate: { type: Date, default: null },
    // Deprecated: previously set on vacate-request approval for an auto-deactivation
    // cron. The approved vacating date now lives on the VacateRequest; the admin
    // completes vacating manually on/after it. Kept only for legacy data.
    scheduledDeactivationDate: { type: Date, default: null },
    // Set by Undo-vacate when the previous bed is no longer available — the tenant
    // is active but needs a new room assignment. Cleared once a bed is assigned.
    needsReassignment: { type: Boolean, default: false },

    // ── Account lockout (tenant password login) ──────────
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

tenantSchema.set("toJSON", { virtuals: true });
tenantSchema.set("toObject", { virtuals: true });

tenantSchema.index({ ownerId: 1, hostelId: 1 });
tenantSchema.index({ ownerId: 1, hostelId: 1, isActive: 1 });
// Admin tenant list sorts by createdAt — index-back the default (no-search) sort.
tenantSchema.index({ ownerId: 1, hostelId: 1, isActive: 1, createdAt: -1 });
// Per-hostel email uniqueness (compound).
tenantSchema.index({ ownerId: 1, hostelId: 1, "personalInfo.email": 1 }, { unique: true });
// Global email lookups (owner-facing search / cross-hostel dedup). Non-unique —
// per-hostel uniqueness is covered by the compound index above.
tenantSchema.index({ "personalInfo.email": 1 });
// Tenant OTP / password auth looks up by phone — avoid full collection scans.
tenantSchema.index({ "personalInfo.phone": 1 }, { unique: true });
// Cleanup cron: find inactive tenants past their scheduledDeletionDate.
tenantSchema.index({ isActive: 1, scheduledDeletionDate: 1 });
// Legacy index for the removed auto-deactivation cron (kept for existing data).
tenantSchema.index({ isActive: 1, scheduledDeactivationDate: 1 });
tenantSchema.index({ ownerId: 1, hostelId: 1, floorId: 1 });
tenantSchema.index({ ownerId: 1, hostelId: 1, roomId: 1 });
// Prevent multiple active tenants occupying the same bed.
tenantSchema.index(
  { bedId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      bedId: { $type: "objectId" },
    },
  }
);

tenantSchema.pre("save", async function hashPassword() {
  if (!this.isModified("personalInfo.password")) return;
  this.personalInfo.password = await bcrypt.hash(this.personalInfo.password, 10);
});

tenantSchema.methods.comparePassword = function compare(candidate) {
  return bcrypt.compare(candidate, this.personalInfo?.password || "");
};

// ── Account lockout methods ──────────────────────────────
tenantSchema.methods.isLocked = function isLocked() {
  return this.lockUntil && this.lockUntil > new Date();
};

tenantSchema.methods.incrementLoginAttempts = async function incrementLoginAttempts() {
  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= ACCOUNT.MAX_LOGIN_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + ACCOUNT.LOCK_DURATION_MS);
  }
  await this.save();
};

tenantSchema.methods.resetLoginAttempts = async function resetLoginAttempts() {
  this.loginAttempts = 0;
  this.lockUntil = null;
  await this.save();
};

export const Tenant = mongoose.model("Tenant", tenantSchema);
