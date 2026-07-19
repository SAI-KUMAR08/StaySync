import mongoose from "mongoose";

const mealTimingSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "snacks", "dinner"],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    items: [{ type: String, trim: true }],
    startTime: { type: String, trim: true, default: "" },
    endTime: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      default: null,
      description: "0=Sunday, 6=Saturday. null means every day.",
    },
  },
  { timestamps: true }
);

mealTimingSchema.index({ ownerId: 1, hostelId: 1, mealType: 1, dayOfWeek: 1 });
mealTimingSchema.index({ ownerId: 1, hostelId: 1, isActive: 1 });

mealTimingSchema.set("toJSON", { virtuals: true });
mealTimingSchema.set("toObject", { virtuals: true });

export const MealTiming = mongoose.model("MealTiming", mealTimingSchema);
