import mongoose from "mongoose";

const bedShiftRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
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

export const BedShiftRequest = mongoose.model("BedShiftRequest", bedShiftRequestSchema);
