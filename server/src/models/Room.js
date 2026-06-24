import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    roomNumber: { type: String, required: true, trim: true },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", default: null },
    floor: { type: Number, default: 1, min: 0 },
    capacity: { type: Number, required: true, min: 1, max: 20 },
    roomType: { type: String, enum: ["AC", "Non-AC"], default: "Non-AC" },
    pricing: { type: Number, default: 0, min: 0, alias: "monthlyRent" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    // Compatibility fields
    occupiedBeds: { type: Number, default: 0, min: 0 },
    availableBeds: { type: Number, default: 0, min: 0 },
    amenities: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Virtual for type mapped to roomType
roomSchema.virtual("type")
  .get(function () { return this.roomType; })
  .set(function (val) { this.roomType = val; });

roomSchema.set("toJSON", { virtuals: true });
roomSchema.set("toObject", { virtuals: true });

roomSchema.index({ ownerId: 1, hostelId: 1 });
roomSchema.index({ ownerId: 1, hostelId: 1, roomNumber: 1 }, { unique: true });

export const Room = mongoose.model("Room", roomSchema);

