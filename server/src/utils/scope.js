import mongoose from "mongoose";

export function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

/** Multi-tenant filter for owner-scoped routes */
export function ownerFilter(req) {
  const ownerId = req.user.role === "owner" ? req.user.id : req.user.ownerId;
  return {
    ownerId: toObjectId(ownerId),
    hostelId: toObjectId(req.user.hostelId),
  };
}
