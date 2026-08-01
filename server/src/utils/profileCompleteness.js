/**
 * Single source of truth for the mandatory tenant-profile fields.
 *
 * Used by the daily incomplete-profile cron, the owner's
 * GET /owner/tenants/incomplete-profiles, and the tenant's own
 * GET /tenant/profile-completeness — so the three surfaces can never drift.
 *
 * Each item carries `canSelfServe`: true when the tenant can correct the field
 * themselves through the profile-change-request workflow, false when only the
 * admin can record it (room assignment, document uploads).
 */

const REQUIRED_FIELDS = [
  { key: "name", label: "Full Name", canSelfServe: true },
  { key: "phone", label: "Mobile Number", canSelfServe: true },
  { key: "emergencyContact", label: "Emergency Contact", canSelfServe: true },
  { key: "aadhaarNumber", label: "Aadhaar Number", canSelfServe: true },
  { key: "address", label: "Address", canSelfServe: true },
  { key: "roomId", label: "Room Number", canSelfServe: false },
  { key: "idProof", label: "ID Proof Document", canSelfServe: false },
  { key: "offlineBookingForm", label: "Registration Form Document", canSelfServe: false },
];

function present(t, key) {
  if (!t) return false;
  const raw = key === "name" || key === "phone" ? (t.personalInfo?.[key] ?? t[key]) : t[key];
  return typeof raw === "string" ? raw.trim() !== "" : !!raw;
}

/**
 * Return the list of mandatory fields missing from a tenant document.
 * Pass `{ tenantFacing: true }` to limit to the fields the tenant can fix
 * themselves (documents / room remain owner-managed).
 */
export function getMissingProfileFields(t, { tenantFacing = false } = {}) {
  return REQUIRED_FIELDS.filter((f) => !present(t, f.key)).filter((f) =>
    tenantFacing ? f.canSelfServe : true
  );
}

export function getProfileCompleteness(t, { tenantFacing = false } = {}) {
  const missing = getMissingProfileFields(t, { tenantFacing });
  return {
    isComplete: missing.length === 0,
    missing,
  };
}
