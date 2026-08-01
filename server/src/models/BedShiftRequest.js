import mongoose from "mongoose";

const bedShiftRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    currentBedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", required: true },
    requestedRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    ownerNote: { type: String, trim: true },
  },
  { timestamps: true }
);

bedShiftRequestSchema.index({ ownerId: 1, hostelId: 1, status: 1 });
// Tenant's own request history (mostly non-pending) — the pending-only partial
// unique index below cannot cover it, so this prevents a collection scan.
bedShiftRequestSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1, createdAt: -1 });
// At most one pending bed shift request per tenant (enforced in requestBedShift)
bedShiftRequestSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const BedShiftRequest = mongoose.model("BedShiftRequest", bedShiftRequestSchema);
