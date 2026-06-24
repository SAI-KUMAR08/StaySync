import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["owner", "tenant"], required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, index: true },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
