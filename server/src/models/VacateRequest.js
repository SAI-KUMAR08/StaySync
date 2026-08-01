import mongoose from "mongoose";

const vacateRequestSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    requestedVacateDate: { type: Date, required: true },
    reason: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", default: null },
    reviewDate: { type: Date, default: null },
    reviewNotes: { type: String, trim: true, default: "" },
    // The vacating date the admin approved — set to the tenant's requested date
    // when the request is approved. The tenant stays active (keeping their room)
    // until this date; the admin completes the actual vacating on or after it.
    approvedVacateDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vacateRequestSchema.index({ ownerId: 1, hostelId: 1, status: 1 });
vacateRequestSchema.index({ tenantId: 1, status: 1 });
// At most one pending vacate request per tenant (enforced in createVacateRequest)
vacateRequestSchema.index(
  { tenantId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "tenantId_1_status_1_pending_unique",
  }
);

export const VacateRequest = mongoose.model("VacateRequest", vacateRequestSchema);
