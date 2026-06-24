import mongoose from "mongoose";

const floorSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    floorName: { type: String, required: true, trim: true, alias: "name" },
    floorNumber: { type: Number, required: true, min: 0, alias: "level" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

floorSchema.index({ ownerId: 1, hostelId: 1 });
floorSchema.index({ ownerId: 1, hostelId: 1, floorNumber: 1 }, { unique: true });

floorSchema.set("toJSON", { virtuals: true });
floorSchema.set("toObject", { virtuals: true });

export const Floor = mongoose.model("Floor", floorSchema);

