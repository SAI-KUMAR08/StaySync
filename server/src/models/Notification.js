import mongoose from "mongoose";

/**
 * A durable, tenant-targeted notification (complaint updates, profile-review
 * decisions, vacate / bed-shift outcomes, new notices, system alerts).
 *
 * Unlike the transient hostel-wide socket events, these persist so a tenant
 * with the page closed still sees them on next login.
 */
const notificationSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: {
      type: String,
      enum: [
        "complaint",
        "profile",
        "vacate",
        "bed_shift",
        "notice",
        "payment",
        "rent",
        "rent_due",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ ownerId: 1, hostelId: 1, tenantId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
