/**
 * Shared named constants for the security-critical magic numbers used across
 * auth, OTP, and tenant lifecycle flows (L-6).
 */

/** Account lockout policy (password login). */
export const ACCOUNT = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

/** One-time-password policy. */
export const OTP_CONFIG = {
  MIN: 100000,
  MAX: 999999,
  COOLDOWN_MS: 15 * 1000, // 15 seconds between requests
  EXPIRY_MS: 10 * 60 * 1000, // 10 minutes validity
  MAX_ATTEMPTS: 5, // wrong entries before the OTP is invalidated
};

/** Per-(account+IP) login failure tracking — mitigates unauthenticated lockout DoS. */
export const IP_FAILURE = {
  MAX: 5,
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
};

/** Token lifetimes. Refresh tokens are stored with a 30-day expiry. */
export const TOKEN = {
  REFRESH_LIFETIME_MS: 30 * 24 * 60 * 60 * 1000,
};

/** Tenant eviction / cleanup / deposit policy. */
export const TENANT = {
  SCHEDULED_DELETION_MS: 15 * 24 * 60 * 60 * 1000, // retain records 15 full days after the actual vacating timestamp, then hard-delete
  SECURITY_DEPOSIT_AMOUNT: 1000, // fixed deposit applied to every new tenant
  // A vacate request must be submitted at least this many days before the
  // intended vacating date. After approval the tenant stays active until that
  // date — the admin completes the vacating manually on or after it.
  VACATE_MIN_NOTICE_DAYS: 15,
};

/** Payment status policy. */
export const PAYMENT = {
  OVERDUE_GRACE_MS: 5 * 24 * 60 * 60 * 1000, // 5 full days after creation before Unpaid → Overdue
};

/**
 * Bed-shift request review policy.
 *
 * After a bed-shift approval the tenant's old bed is held (excluded from the
 * waiting queue and other auto-allocation) for HOLD_RELEASE_MS so an admin Undo
 * can move the tenant back. The timing mirrors the client's undo toast (8s) +
 * the 2s auto-delete delay + the 30s the owner requested before the bed may be
 * re-allotted, with a small buffer.
 */
export const BED_SHIFT = {
  HOLD_RELEASE_MS: 45 * 1000,
};
