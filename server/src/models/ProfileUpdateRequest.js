import mongoose from "mongoose";

/**
 * A tenant-initiated profile change awaiting admin review.
 *
 * The tenant submits requestedChanges; the admin compares them against
 * currentSnapshot and approves/rejects. The tenant's official record is only
 * mutated on approval (see owner/profileController.js) — a rejected request
 * leaves the profile untouched.
 */
const profileUpdateRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },

    requestedChanges: {
      name: { type: String, trim: true, default: undefined },
      phone: { type: String, trim: true, default: undefined },
      email: { type: String, lowercase: true, trim: true, default: undefined },
      address: { type: String, trim: true, default: undefined },
      emergencyContact: { type: String, trim: true, default: undefined },
      aadhaarNumber: { type: String, trim: true, default: undefined },
      // Attached supporting documents (photos, PDFs, DOCX) uploaded by the tenant
      documents: [
        {
          name: { type: String, trim: true }, // original filename for display
          url: { type: String }, // base64 data URL or https URL
        },
      ],
    },

    // Snapshot of the official values at request time, so the admin can review
    // current vs requested side by side even if other changes land meanwhile.
    currentSnapshot: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
      emergencyContact: { type: String, default: "" },
      aadhaarNumber: { type: String, default: null },
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", default: null },
    reviewDate: { type: Date, default: null },
    reviewNotes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

profileUpdateRequestSchema.index({ ownerId: 1, hostelId: 1, status: 1 });
// Tenant's own request history (mostly approved/rejected) — the pending-only
// partial unique index below cannot cover it, so this prevents a collection scan.
profileUpdateRequestSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1, createdAt: -1 });
// At most one pending profile request per tenant (enforced in createProfileRequest)
profileUpdateRequestSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const ProfileUpdateRequest = mongoose.model(
  "ProfileUpdateRequest",
  profileUpdateRequestSchema
);
