import mongoose from "mongoose";

const roomAssignmentHistorySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed" },
    action: { type: String, enum: ["check_in", "bed_shift", "check_out"], required: true },
    monthlyRent: { type: Number },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

roomAssignmentHistorySchema.index({ tenantId: 1, date: -1 });

export const RoomAssignmentHistory = mongoose.model("RoomAssignmentHistory", roomAssignmentHistorySchema);
