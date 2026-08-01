import mongoose from "mongoose";

const bedSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    bedNumber: { type: String, required: true, trim: true, alias: "bedLabel" },
    occupancyStatus: {
      type: String,
      enum: ["available", "occupied", "maintenance"],
      default: "available",
      alias: "status",
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    pricing: { type: Number, default: 0, min: 0, alias: "monthlyRent" },
    // When set, the bed cannot be auto-claimed (waiting queue / allocation) until
    // this timestamp. Used to hold a tenant's old bed right after a bed-shift
    // approval so an admin Undo can still move them back.
    holdUntil: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

bedSchema.set("toJSON", { virtuals: true });
bedSchema.set("toObject", { virtuals: true });

bedSchema.index({ ownerId: 1, hostelId: 1, roomId: 1, bedNumber: 1 }, { unique: true });
bedSchema.index({ tenantId: 1 }, { sparse: true });
// Hot allocation path: availability/occupancy lookups filter on occupancyStatus.
bedSchema.index({ ownerId: 1, hostelId: 1, occupancyStatus: 1, tenantId: 1, holdUntil: 1 });

export const Bed = mongoose.model("Bed", bedSchema);
