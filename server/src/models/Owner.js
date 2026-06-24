import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    role: { type: String, enum: ["owner", "manager"], default: "owner" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", default: null, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ownerSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

ownerSchema.methods.comparePassword = function compare(candidate) {
  return bcrypt.compare(candidate, this.password);
};

ownerSchema.virtual("hostels", {
  ref: "Hostel",
  localField: "_id",
  foreignField: "ownerId",
});

ownerSchema.set("toJSON", { virtuals: true });
ownerSchema.set("toObject", { virtuals: true });

export const Owner = mongoose.model("Owner", ownerSchema);

