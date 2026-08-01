import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    mobile: { type: String, required: true, trim: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    failedAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ userId: 1, verified: 1 });

// Virtual properties for compatibility with ownerId and tenantId
otpSchema
  .virtual("ownerId")
  .get(function () {
    return this.userId;
  })
  .set(function (val) {
    this.userId = val;
  });

otpSchema
  .virtual("tenantId")
  .get(function () {
    return this.userId;
  })
  .set(function (val) {
    this.userId = val;
  });

otpSchema.set("toJSON", { virtuals: true });
otpSchema.set("toObject", { virtuals: true });

export const OTP = mongoose.model("OTP", otpSchema);
