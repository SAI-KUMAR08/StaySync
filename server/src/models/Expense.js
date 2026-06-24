import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    category: {
      type: String,
      enum: [
        "electricity", "water", "maintenance", "cleaning",
        "food", "salary", "repairs", "internet",
        "security", "supplies", "furniture", "other"
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card", "other"],
      default: "cash",
    },
    vendor: { type: String, trim: true, default: "" },
    receiptUrl: { type: String, default: "" },
    isRecurring: { type: Boolean, default: false },
  },
  { timestamps: true }
);

expenseSchema.index({ ownerId: 1, hostelId: 1, date: -1 });
expenseSchema.index({ ownerId: 1, hostelId: 1, category: 1 });

export default mongoose.model("Expense", expenseSchema);
