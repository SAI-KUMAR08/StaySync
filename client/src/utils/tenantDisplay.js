/** Map API tenant document to display-friendly fields */
export function mapTenantForDisplay(tenant) {
  if (!tenant) return tenant;
  return {
    ...tenant,
    name: tenant.name || tenant.personalInfo?.name || "",
    phone: tenant.phone || tenant.personalInfo?.phone || "",
    email: tenant.email || tenant.personalInfo?.email || "",
    status: tenant.isActive === false ? "inactive" : "active",
    rentAmount: tenant.monthlyRent ?? 0,
    hostelName: tenant.hostelId?.hostelName || "",
    roomDetails: {
      roomId: { number: tenant.roomId?.roomNumber ?? "N/A" },
      floorId: { number: tenant.floorId?.level ?? tenant.floorId?.name ?? "—" },
      bedId: { number: tenant.bedId?.bedLabel ?? "—" },
    },
  };
}
