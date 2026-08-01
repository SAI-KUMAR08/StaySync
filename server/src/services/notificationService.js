import { Notification, Tenant } from "../models/index.js";

/**
 * Persist a notification for one tenant and emit a socket event so open pages
 * update live. The socket payload includes tenantId so clients can filter to
 * their own notifications.
 */
export async function createTenantNotification({
  ownerId,
  hostelId,
  tenantId,
  type,
  title,
  message,
  io,
}) {
  const notification = await Notification.create({
    ownerId,
    hostelId,
    tenantId,
    type,
    title,
    message,
  });
  if (io && hostelId) {
    // Deliver the private content ONLY to the owning tenant's socket(s). The
    // whole hostel shares one room, so a room broadcast would leak every
    // tenant's payment amounts / complaint replies / vacate reasons to all their
    // neighbours. Clients treat this event as a refetch trigger keyed on
    // tenantId, so non-owners simply receive nothing and don't refetch.
    const room = io.sockets.adapter.rooms.get(`hostel_${hostelId}`);
    if (room) {
      for (const sid of room) {
        const sock = io.sockets.sockets.get(sid);
        if (sock?.user && String(sock.user.id) === String(tenantId)) {
          sock.emit("new_notification", {
            _id: notification._id,
            tenantId,
            type,
            title,
            message,
            createdAt: notification.createdAt,
          });
        }
      }
    }
  }
  return notification;
}

/**
 * Create a notification for every active tenant in a hostel (used for broadcast
 * notices). Returns the number created.
 */
export async function notifyAllTenants({ ownerId, hostelId, type, title, message, io }) {
  const tenants = await Tenant.find({ ownerId, hostelId, isActive: true }).select("_id");
  if (tenants.length === 0) return 0;

  const docs = tenants.map((t) => ({ ownerId, hostelId, tenantId: t._id, type, title, message }));
  const inserted = await Notification.insertMany(docs);
  if (io && hostelId) {
    // The broadcast event carries no tenantId — clients just refetch their inbox.
    io.to(`hostel_${hostelId}`).emit("new_notification", {
      broadcast: true,
      hostelId,
      type,
      title,
      message,
    });
  }
  return inserted.length;
}
