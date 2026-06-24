import mongoose from "mongoose";

const bedSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    bedNumber: { type: String, required: true, trim: true, alias: "bedLabel" },
    occupancyStatus: { type: String, enum: ["available", "occupied", "maintenance"], default: "available", alias: "status" },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    pricing: { type: Number, default: 0, min: 0, alias: "monthlyRent" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

bedSchema.set("toJSON", { virtuals: true });
bedSchema.set("toObject", { virtuals: true });

bedSchema.index({ ownerId: 1, hostelId: 1 });
bedSchema.index({ ownerId: 1, hostelId: 1, roomId: 1, bedNumber: 1 }, { unique: true });
bedSchema.index({ tenantId: 1 }, { sparse: true });

export const Bed = mongoose.model("Bed", bedSchema);

