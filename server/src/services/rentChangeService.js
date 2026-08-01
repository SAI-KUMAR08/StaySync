import { Tenant, Notice } from "../models/index.js";
import { createTenantNotification } from "./notificationService.js";

/**
 * Pure helper: build the fields for a `rent_changed` notice. Kept pure so the
 * message format is unit-testable without a database.
 *
 * The notice is hostel-level (notices have no per-tenant recipient field), so
 * the affected tenant is named in the message — every tenant of the hostel sees
 * the notice, and the named tenant knows it is about them.
 */
export function buildRentChangeNotice({ tenantName, oldRent, newRent, location }) {
  const locationPart = location ? ` for ${location}` : "";
  return {
    title: "Rent Update",
    message: `Dear ${tenantName}, your monthly rent${locationPart} has been updated from ₹${oldRent} to ₹${newRent}.`,
    type: "rent_changed",
    priority: "medium",
  };
}

/**
 * Sync a tenant's monthlyRent to a new effective price and send a `rent_changed`
 * notice. No-op (no DB writes, no notice) when:
 *   - the new price equals the tenant's current rent (avoids spam on unchanged
 *     saves),
 *   - the tenant is not found / not active in the given hostel,
 *   - the amount is not a finite number or is negative.
 *
 * Emits `tenant_updated` (admin tenant list / profile views refresh) and
 * `notice_created` (tenant dashboard + notice boards refresh live) to the
 * hostel room when sockets are available.
 *
 * Returns `{ tenant, notice }` when a change was applied, otherwise `null`.
 */
export async function syncTenantRentForPricingChange({
  ownerId,
  hostelId,
  tenantId,
  newRent,
  location,
  io,
}) {
  const newAmount = Number(newRent);
  if (!Number.isFinite(newAmount) || newAmount < 0) return null;

  const tenant = await Tenant.findOne({ _id: tenantId, ownerId, hostelId, isActive: true });
  if (!tenant) return null;

  const oldRent = Number(tenant.monthlyRent) || 0;
  if (oldRent === newAmount) return null;

  tenant.monthlyRent = newAmount;
  await tenant.save();

  const tenantName = tenant.name || tenant.personalInfo?.name || "Tenant";
  const notice = await Notice.create({
    ownerId,
    hostelId,
    ...buildRentChangeNotice({ tenantName, oldRent, newRent: newAmount, location }),
    isActive: true,
  });

  if (io && hostelId) {
    const room = `hostel_${hostelId}`;
    io.to(room).emit("tenant_updated", {
      _id: tenant._id,
      hostelId,
      isActive: tenant.isActive,
    });
    io.to(room).emit("notice_created", notice);
  }

  // Durable inbox entry so the affected tenant is notified personally (the
  // notice above is hostel-wide and names them; this one is addressed to them).
  createTenantNotification({
    ownerId,
    hostelId,
    tenantId: tenant._id,
    type: "rent",
    title: "Your rent has been updated",
    message: buildRentChangeNotice({ tenantName, oldRent, newRent: newAmount, location }).message,
    io,
  }).catch(() => {});

  return { tenant, notice };
}
