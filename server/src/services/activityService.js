import { ActivityLog } from "../models/index.js";

export async function logActivity({ ownerId, hostelId, actorId, actorRole, action, entityType, entityId, metadata }) {
  await ActivityLog.create({
    ownerId,
    hostelId,
    actorId,
    actorRole,
    action,
    entityType,
    entityId,
    metadata,
  });
}
