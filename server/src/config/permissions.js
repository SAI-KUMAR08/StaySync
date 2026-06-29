/**
 * Granular permission-based authorization system.
 *
 * Each role maps to a set of permission strings.
 * Use with `requirePermission(...)` middleware in routes.
 *
 * Permission naming convention: <action>:<resource>
 *   action — read, create, update, delete, manage
 *   resource — tenants, payments, expenses, complaints, etc.
 */

export const PERMISSIONS = {
  // ─── Tenants ─────────────────────────────────────────
  READ_TENANTS: "read:tenants",
  CREATE_TENANTS: "create:tenants",
  UPDATE_TENANTS: "update:tenants",
  DELETE_TENANTS: "delete:tenants",

  // ─── Payments & Financial ────────────────────────────
  READ_PAYMENTS: "read:payments",
  CREATE_PAYMENTS: "create:payments",
  UPDATE_PAYMENTS: "update:payments",
  DELETE_PAYMENTS: "delete:payments",

  // ─── Expenses (owner-only financial) ─────────────────
  READ_EXPENSES: "read:expenses",
  CREATE_EXPENSES: "create:expenses",
  UPDATE_EXPENSES: "update:expenses",
  DELETE_EXPENSES: "delete:expenses",

  // ─── Complaints / Support Tickets ─────────────────────
  READ_COMPLAINTS: "read:complaints",
  UPDATE_COMPLAINTS: "update:complaints",

  // ─── Rooms / Beds / Inventory ────────────────────────
  READ_ROOMS: "read:rooms",
  CREATE_ROOMS: "create:rooms",
  UPDATE_ROOMS: "update:rooms",
  DELETE_ROOMS: "delete:rooms",
  READ_BEDS: "read:beds",
  UPDATE_BEDS: "update:beds",

  // ─── Hostel / Structure Setup ────────────────────────
  READ_HOSTEL: "read:hostel",
  UPDATE_HOSTEL: "update:hostel",
  MANAGE_HOSTEL: "manage:hostel",

  // ─── Notices ─────────────────────────────────────────
  READ_NOTICES: "read:notices",
  CREATE_NOTICES: "create:notices",
  DELETE_NOTICES: "delete:notices",

  // ─── Managers ────────────────────────────────────────
  READ_MANAGERS: "read:managers",
  CREATE_MANAGERS: "create:managers",
  DELETE_MANAGERS: "delete:managers",

  // ─── Dashboard ───────────────────────────────────────
  READ_DASHBOARD: "read:dashboard",
  READ_OCCUPANCY: "read:occupancy",

  // ─── Bed Shift Requests ──────────────────────────────
  READ_BED_SHIFT_REQUESTS: "read:bed-shift-requests",
  UPDATE_BED_SHIFT_REQUESTS: "update:bed-shift-requests",

  // ─── Profile / Session ───────────────────────────────
  READ_SESSIONS: "read:sessions",
  DELETE_SESSIONS: "delete:sessions",
};

/**
 * Role → Permission mapping.
 * owner  — full access to everything
 * manager — operational access; no financial write, no manager management, no structure delete
 * tenant — read-only self-service access
 */
const ROLE_PERMISSIONS = {
  owner: Object.values(PERMISSIONS),

  manager: [
    PERMISSIONS.READ_TENANTS,
    PERMISSIONS.CREATE_TENANTS, // managers can onboard residents
    PERMISSIONS.UPDATE_TENANTS,
    PERMISSIONS.READ_PAYMENTS, // read-only payments (masked financial data at controller level)
    PERMISSIONS.READ_COMPLAINTS,
    PERMISSIONS.UPDATE_COMPLAINTS,
    PERMISSIONS.READ_ROOMS,
    PERMISSIONS.READ_BEDS,
    PERMISSIONS.READ_HOSTEL,
    PERMISSIONS.UPDATE_HOSTEL,
    PERMISSIONS.READ_NOTICES,
    PERMISSIONS.CREATE_NOTICES,
    PERMISSIONS.DELETE_NOTICES,
    PERMISSIONS.READ_DASHBOARD,
    PERMISSIONS.READ_OCCUPANCY,
    PERMISSIONS.READ_BED_SHIFT_REQUESTS,
    PERMISSIONS.UPDATE_BED_SHIFT_REQUESTS,
    PERMISSIONS.READ_SESSIONS,
    PERMISSIONS.DELETE_SESSIONS,
  ],

  tenant: [
    PERMISSIONS.READ_NOTICES,
    PERMISSIONS.READ_COMPLAINTS, // own complaints
    PERMISSIONS.READ_SESSIONS,
    PERMISSIONS.DELETE_SESSIONS,
  ],
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get all permissions granted to a role.
 */
export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}
