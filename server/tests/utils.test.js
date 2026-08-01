import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-1234567890";

const { normalizePhone } = await import("../src/utils/phone.js");
const { escapeRegex } = await import("../src/utils/regex.js");
const { getEnglishMonthName } = await import("../src/utils/date.js");
const { hasPermission, getPermissionsForRole, PERMISSIONS } =
  await import("../src/config/permissions.js");
const { isOriginAllowed } = await import("../src/utils/corsOrigins.js");
const { TENANT } = await import("../src/utils/constants.js");

test("normalizePhone keeps last 10 digits", () => {
  assert.equal(normalizePhone("+91 9876543210"), "9876543210");
  assert.equal(normalizePhone("919876543210"), "9876543210");
  assert.equal(normalizePhone("98765"), "98765");
  assert.equal(normalizePhone(undefined), "");
});

test("escapeRegex escapes regex metacharacters", () => {
  assert.equal(escapeRegex("a.b[c]"), "a\\.b\\[c\\]");
  assert.equal(escapeRegex("plain"), "plain");
  assert.equal(escapeRegex(null), "");
});

test("getEnglishMonthName is locale-independent (L-11)", () => {
  // The implementation hardcodes "en-US", so the name is stable on any host —
  // unlike `toLocaleString("default", ...)`, which would return the machine's
  // locale month name (e.g. "juillet" on a French server).
  assert.equal(getEnglishMonthName(new Date(2026, 6, 15)), "July");
  assert.equal(getEnglishMonthName(new Date(2026, 11, 31)), "December");
});

test("permissions: owner has full access, tenant is self-service only", () => {
  assert.equal(hasPermission("owner", PERMISSIONS.READ_TENANTS), true);
  assert.equal(hasPermission("owner", PERMISSIONS.CREATE_PAYMENTS), true);
  assert.equal(hasPermission("tenant", PERMISSIONS.READ_TENANTS), false);
  assert.equal(hasPermission("tenant", PERMISSIONS.READ_NOTICES), true);
  assert.equal(hasPermission("unknown-role", PERMISSIONS.READ_NOTICES), false);
  assert.ok(getPermissionsForRole("owner").length > 0);
  assert.deepEqual(getPermissionsForRole("bogus"), []);
});

test("retention policy: vacated tenant data is retained for exactly 15 full days (req 7)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  assert.equal(TENANT.SCHEDULED_DELETION_MS, 15 * DAY);
});

test("vacate notice policy: request must be at least 15 days before the vacating date", () => {
  assert.equal(TENANT.VACATE_MIN_NOTICE_DAYS, 15);
});

test("corsOrigins: localhost + own deployed fronts allowed, arbitrary vercel.app blocked (H-1)", () => {
  assert.equal(isOriginAllowed("http://localhost:5173"), true);
  assert.equal(isOriginAllowed("https://my-hostel-client.vercel.app"), true);
  assert.equal(isOriginAllowed("https://hostel-frontend-git-main-abc1234.vercel.app"), true);
  assert.equal(isOriginAllowed(undefined), true); // non-browser request
  // Tightened wildcard: another project's preview must NOT be allowed.
  assert.equal(isOriginAllowed("https://some-evil-project-xyz.vercel.app"), false);
  assert.equal(isOriginAllowed("https://totally-unrelated.com"), false);
});
