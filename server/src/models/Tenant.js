import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const tenantSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    
    personalInfo: {
      name: { type: String, required: true, trim: true, alias: "name" },
      email: { type: String, required: true, lowercase: true, trim: true, alias: "email" },
      phone: { type: String, required: true, trim: true, alias: "phone" },
      password: { type: String, select: false, alias: "password" },
    },
    
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    role: { type: String, enum: ["tenant"], default: "tenant" },
    
    // A tenant must always belong to Hostel -> Floor -> Room -> Bed while active.
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", default: null },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null },
    
    monthlyRent: { type: Number, default: 0, min: 0 },
    emergencyContact: { type: String, trim: true },
    paymentStatus: { type: String, enum: ["paid", "unpaid", "overdue", "partial"], default: "unpaid" },
    moveInDate: { type: Date, default: Date.now, alias: "joinDate" },
    moveOutDate: { type: Date, default: null },
    verificationStatus: { type: String, enum: ["pending", "verified"], default: "verified" },
    
    idProof: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isTemporary: { type: Boolean, default: false },
    preferredSharing: { type: Number, default: null },
  },
  { timestamps: true }
);

tenantSchema.set("toJSON", { virtuals: true });
tenantSchema.set("toObject", { virtuals: true });

tenantSchema.index({ ownerId: 1, hostelId: 1 });
tenantSchema.index({ ownerId: 1, hostelId: 1, "personalInfo.email": 1 }, { unique: true });
tenantSchema.index({ ownerId: 1, hostelId: 1, floorId: 1 });
tenantSchema.index({ ownerId: 1, hostelId: 1, roomId: 1 });
// Prevent multiple active tenants occupying the same bed.
tenantSchema.index(
  { bedId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      bedId: { $type: "objectId" },
    },
  }
);

tenantSchema.pre("save", async function hashPassword() {
  if (!this.isModified("personalInfo.password")) return;
  this.personalInfo.password = await bcrypt.hash(this.personalInfo.password, 10);
});

tenantSchema.methods.comparePassword = function compare(candidate) {
  return bcrypt.compare(candidate, this.personalInfo?.password || "");
};

export const Tenant = mongoose.model("Tenant", tenantSchema);

