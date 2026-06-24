import mongoose from "mongoose";

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "assigned", "in_progress", "resolved", "closed"],
      required: true,
    },
    note: { type: String, trim: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    changedByRole: { type: String, enum: ["owner", "tenant"], required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true, index: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["electrical", "cleaning", "water", "wifi", "food", "maintenance", "others"],
      required: true,
    },
    priority: { type: String, enum: ["low", "medium", "high", "emergency"], default: "medium" },
    status: {
      type: String,
      enum: ["pending", "assigned", "in_progress", "resolved", "closed"],
      default: "pending",
    },
    assignedTo: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    slaDueAt: { type: Date },
    resolvedAt: { type: Date },
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

complaintSchema.index({ ownerId: 1, hostelId: 1, status: 1 });
complaintSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1 });

export const Complaint = mongoose.model("Complaint", complaintSchema);
