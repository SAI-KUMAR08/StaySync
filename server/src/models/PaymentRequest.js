import mongoose from "mongoose";

const paymentRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    paymentMonth: { type: String, required: true },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentProof: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", default: null },
    reviewDate: { type: Date, default: null },
    reviewNotes: { type: String, trim: true, default: "" },
    // The payment record created on approval
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  { timestamps: true }
);

paymentRequestSchema.index({ ownerId: 1, hostelId: 1, status: 1 });
paymentRequestSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1, status: 1 });

paymentRequestSchema.set("toJSON", { virtuals: true });
paymentRequestSchema.set("toObject", { virtuals: true });

export const PaymentRequest = mongoose.model("PaymentRequest", paymentRequestSchema);
