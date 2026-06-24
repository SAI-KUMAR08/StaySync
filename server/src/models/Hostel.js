import mongoose from "mongoose";

const hostelSchema = new mongoose.Schema(
  {
    // One owner can manage multiple hostels
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    name: { type: String, required: true, trim: true, alias: "hostelName" },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    totalFloors: { type: Number, default: 1, min: 1 },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    statistics: { type: mongoose.Schema.Types.Mixed, default: {} },
    lateFeeGracePeriodDays: { type: Number, default: 5, min: 0 },
    lateFeeDailyRate: { type: Number, default: 50, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hostelSchema.index({ ownerId: 1, name: 1 }, { unique: true });

hostelSchema.set("toJSON", { virtuals: true });
hostelSchema.set("toObject", { virtuals: true });

export const Hostel = mongoose.model("Hostel", hostelSchema);

