import mongoose from "mongoose";

/**
 * Waiting queue for temporarily-allotted tenants who have requested a permanent
 * room type. First requested, first served — ordered by `requestedAt`, then by
 * `_id` as a stable tie-breaker.
 */
const temporaryAllotmentRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    requestedSharingType: { type: Number, required: true },
    status: {
      type: String,
      enum: ["waiting", "completed", "cancelled"],
      default: "waiting",
    },
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    // Snapshot of the tenant's temporary allotment at request time.
    tempRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    tempBedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null },
  },
  { timestamps: true }
);

// FIFO scan per hostel + room type.
temporaryAllotmentRequestSchema.index({
  ownerId: 1,
  hostelId: 1,
  status: 1,
  requestedAt: 1,
  _id: 1,
});
// At most one active (waiting) request per tenant — DB-level duplicate guard.
temporaryAllotmentRequestSchema.index(
  { tenantId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "waiting" },
    name: "temp_allotment_tenant_waiting_unique",
  }
);

export const TemporaryAllotmentRequest = mongoose.model(
  "TemporaryAllotmentRequest",
  temporaryAllotmentRequestSchema
);
