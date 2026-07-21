import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["maintenance", "water_shutdown", "curfew", "fee_reminder", "emergency", "general", "system_incomplete_profile"],
      default: "general",
    },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tenant" }],
  },
  { timestamps: true }
);

noticeSchema.index({ ownerId: 1, hostelId: 1, isActive: 1 });

export const Notice = mongoose.model("Notice", noticeSchema);
