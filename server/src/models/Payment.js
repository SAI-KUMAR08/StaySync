import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", index: true, default: null },
    
    paymentMonth: { type: String, required: true, alias: "month" },
    year: { type: Number, required: true },
    
    amount: { type: Number, required: true, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    
    dueDate: { type: Date, required: true },
    paidDate: { type: Date },
    paymentStatus: { type: String, enum: ["paid", "unpaid", "overdue", "partial"], default: "unpaid", alias: "status" },
    paymentMethod: { type: String, trim: true },
    receiptNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    paymentType: { type: String, enum: ["rent", "deposit", "fee"], default: "rent" },
  },
  { timestamps: true }
);

paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });


paymentSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1 });
paymentSchema.index({ ownerId: 1, hostelId: 1, paymentStatus: 1 });
paymentSchema.index({ ownerId: 1, hostelId: 1, year: 1, paymentMonth: 1 });
// Dashboard aggregation queries filter by paymentStatus + paymentType
paymentSchema.index({ ownerId: 1, hostelId: 1, paymentStatus: 1, paymentType: 1, year: 1, paymentMonth: 1 });
// Prevent duplicate invoices for the same tenant-period and type
paymentSchema.index({ tenantId: 1, paymentMonth: 1, year: 1, paymentType: 1 }, { unique: true });

export const Payment = mongoose.model("Payment", paymentSchema);

