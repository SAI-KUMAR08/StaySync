export function emitToHostel(req, event, payload) {
  const io = req.app?.get("io");
  const hostelId = payload?.hostelId ?? req.user?.hostelId;
  if (io && hostelId) {
    io.to(`hostel_${hostelId}`).emit(event, payload);
  }
}

export function emitOccupancyUpdate(req, hostelId) {
  emitToHostel(req, "occupancy_update", { hostelId, at: Date.now() });
}

export function emitTenantAssigned(req, tenant, bed) {
  emitToHostel(req, "tenant_assigned", {
    hostelId: tenant.hostelId,
    tenantId: tenant._id,
    tenantName: tenant.name || tenant.personalInfo?.name,
    bedId: bed?._id,
    message: `${tenant.name || tenant.personalInfo?.name} assigned to bed ${bed?.bedLabel || ""}`.trim(),
  });
  emitOccupancyUpdate(req, tenant.hostelId);
}

export function emitTenantRemoved(req, tenant) {
  emitToHostel(req, "tenant_removed", {
    hostelId: tenant.hostelId,
    tenantId: tenant._id,
    message: `${tenant.name || tenant.personalInfo?.name} removed from hostel`,
  });
  emitOccupancyUpdate(req, tenant.hostelId);
}
