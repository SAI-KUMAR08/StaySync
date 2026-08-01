import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-1234567890";

const { daysBetweenStartOfDay } = await import("../src/utils/date.js");
const { getMissingProfileFields, getProfileCompleteness } =
  await import("../src/utils/profileCompleteness.js");
const { checkPaymentRequestAmount } = await import("../src/services/paymentService.js");
const {
  profileRequestSchema,
  bedShiftSchema,
  mealTimingSchema,
  paymentRequestSchema,
  complaintUpdateSchema,
  tenantCreateSchema,
  tenantUpdateSchema,
} = await import("../src/validators/resources.js");
const { ProfileUpdateRequest } = await import("../src/models/ProfileUpdateRequest.js");
const { PaymentRequest } = await import("../src/models/PaymentRequest.js");

const OID = "507f1f77bcf86cd799439011";

// ── Vacate 15-day boundary math (req 1) ─────────────────────────
test("vacate boundary: exactly 15 whole days passes, 14 fails (start-of-day)", () => {
  const from = new Date(2026, 5, 30, 23, 59); // 30 Jun 23:59
  assert.equal(daysBetweenStartOfDay(from, new Date(2026, 6, 15)), 15); // 15 Jul = 15 days
  assert.equal(daysBetweenStartOfDay(from, new Date(2026, 6, 14)), 14); // 14 Jul = 14 days
  assert.equal(daysBetweenStartOfDay(from, from), 0);
  // A 14-day + 1-minute gap must NOT round up to 15 (the old Math.ceil bug).
  assert.equal(
    daysBetweenStartOfDay(new Date(2026, 5, 30, 23, 59), new Date(2026, 6, 14, 0, 1)),
    14
  );
});

// ── Profile completeness (req 7) ────────────────────────────────
const incompleteTenant = {
  personalInfo: { name: "Arjun", phone: "9876543210" },
  emergencyContact: "",
  aadhaarNumber: null,
  address: "",
  roomId: null,
  idProof: "",
  offlineBookingForm: null,
};

test("profile completeness: owner-facing detects docs/room; tenant-facing only self-serve fields", () => {
  const ownerMissing = getMissingProfileFields(incompleteTenant).map((m) => m.label);
  assert.deepEqual(ownerMissing, [
    "Emergency Contact",
    "Aadhaar Number",
    "Address",
    "Room Number",
    "ID Proof Document",
    "Registration Form Document",
  ]);

  const tenantMissing = getMissingProfileFields(incompleteTenant, { tenantFacing: true }).map(
    (m) => m.label
  );
  assert.deepEqual(tenantMissing, ["Emergency Contact", "Aadhaar Number", "Address"]);
});

test("profile completeness: complete tenant is complete for both surfaces", () => {
  const complete = {
    personalInfo: { name: "Arjun", phone: "9876543210" },
    emergencyContact: "9123456780",
    aadhaarNumber: "123456789012",
    address: "1 Main Road",
    roomId: OID,
    idProof: "data:image/png;base64,abc",
    offlineBookingForm: "https://example.com/form.pdf",
  };
  assert.equal(getProfileCompleteness(complete).isComplete, true);
  assert.equal(getProfileCompleteness(complete, { tenantFacing: true }).isComplete, true);
});

// ── Profile request validator (req 5) ───────────────────────────
test("profileRequestSchema: valid single/multi-field requests pass", () => {
  assert.equal(profileRequestSchema.safeParse({ body: { name: "New Name" } }).success, true);
  assert.equal(profileRequestSchema.safeParse({ body: { phone: "9876543210" } }).success, true);
  assert.equal(
    profileRequestSchema.safeParse({
      body: { name: "Akhil", phone: "9876543210", emergencyContact: "9123456780" },
    }).success,
    true
  );
});

test("profileRequestSchema: invalid phone / aadhaar / empty body / contact clash rejected", () => {
  assert.equal(profileRequestSchema.safeParse({ body: { phone: "987" } }).success, false);
  assert.equal(profileRequestSchema.safeParse({ body: { aadhaarNumber: "123" } }).success, false);
  assert.equal(profileRequestSchema.safeParse({ body: {} }).success, false);
  assert.equal(
    profileRequestSchema.safeParse({
      body: { phone: "9876543210", emergencyContact: "9876543210" },
    }).success,
    false
  );
});

// ── Bed-shift validator (req 1) ─────────────────────────────────
test("bedShiftSchema: requestedRoomId is required so a request can always be approved", () => {
  assert.equal(
    bedShiftSchema.safeParse({ body: { requestedRoomId: OID, reason: "Too noisy at night" } })
      .success,
    true
  );
  assert.equal(bedShiftSchema.safeParse({ body: { reason: "Too noisy at night" } }).success, false);
  assert.equal(
    bedShiftSchema.safeParse({ body: { requestedRoomId: OID, reason: "no" } }).success,
    false
  );
});

// ── Meal timing validation (req 4) ──────────────────────────────
test("mealTimingSchema: accepts 24h and 12h times, rejects garbage", () => {
  assert.equal(
    mealTimingSchema.safeParse({ body: { mealType: "breakfast", startTime: "07:30" } }).success,
    true
  );
  assert.equal(
    mealTimingSchema.safeParse({
      body: { mealType: "breakfast", startTime: "07:30 AM", endTime: "09:30 AM" },
    }).success,
    true
  );
  assert.equal(
    mealTimingSchema.safeParse({ body: { mealType: "breakfast", startTime: "99:99 XM" } }).success,
    false
  );
  assert.equal(
    mealTimingSchema.safeParse({ body: { mealType: "snacks", items: Array(41).fill("x") } })
      .success,
    false
  );
});

// ── Payment request validator (req 3) ───────────────────────────
test("payment request amount must match the outstanding rent invoice", () => {
  const invoice = { totalAmount: 5000, paymentMonth: "July", year: 2026 };
  assert.deepEqual(checkPaymentRequestAmount(5000, invoice), { ok: true, expected: 5000 });
  assert.equal(checkPaymentRequestAmount(4999, invoice).ok, false);
  assert.match(checkPaymentRequestAmount(4999, invoice).message, /does not match/);
  assert.equal(checkPaymentRequestAmount(5000, null).ok, false);
  // Falls back to `amount` when totalAmount is absent (legacy records).
  assert.equal(checkPaymentRequestAmount(4000, { amount: 4000 }).ok, true);
});

test("paymentRequestSchema: amount must be > 0 and bounded", () => {
  assert.equal(
    paymentRequestSchema.safeParse({ body: { paymentMonth: "July", year: 2026, amount: 5000 } })
      .success,
    true
  );
  assert.equal(
    paymentRequestSchema.safeParse({ body: { paymentMonth: "July", year: 2026, amount: 0 } })
      .success,
    false
  );
  assert.equal(
    paymentRequestSchema.safeParse({ body: { paymentMonth: "July", year: 2026, amount: 600000 } })
      .success,
    false
  );
  assert.equal(
    paymentRequestSchema.safeParse({
      body: { paymentMonth: "July", year: 2026, amount: 5000, paymentProof: "not-a-url" },
    }).success,
    false
  );
});

// ── Complaint needs_info status (req 2) ─────────────────────────
test("complaintUpdateSchema: needs_info + note are accepted", () => {
  const base = { params: { id: OID } };
  assert.equal(
    complaintUpdateSchema.safeParse({
      ...base,
      body: { status: "needs_info", note: "Please upload a photo" },
    }).success,
    true
  );
  assert.equal(
    complaintUpdateSchema.safeParse({ ...base, body: { note: "Just a reply" } }).success,
    true
  );
  assert.equal(
    complaintUpdateSchema.safeParse({ ...base, body: { status: "bogus" } }).success,
    false
  );
});

// ── Document upload validation (photos/PDFs) ───────────────────
const docTenant = {
  name: "Arjun",
  phone: "9876543210",
  aadhaarNumber: "123456789012",
  address: "1 Main Road",
  emergencyContact: "9123456780",
  sharingType: 2,
};

test("tenantCreateSchema: accepts photo/PDF data URLs, rejects other doc types", () => {
  const jpeg = tenantCreateSchema.safeParse({
    body: { ...docTenant, idProof: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
  });
  assert.equal(jpeg.success, true);
  const pdf = tenantCreateSchema.safeParse({
    body: { ...docTenant, idProof: "data:application/pdf;base64,JVBERi0xLjQ=" },
  });
  assert.equal(pdf.success, true);
  const html = tenantCreateSchema.safeParse({
    body: { ...docTenant, idProof: "data:text/html;base64,PGh0bWw+" },
  });
  assert.equal(html.success, false);
  const huge = tenantCreateSchema.safeParse({
    body: { ...docTenant, idProof: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` },
  });
  assert.equal(huge.success, false);
});

// ── Tenant update validator (req 7) ─────────────────────────────
test("tenantUpdateSchema: address + 12-digit aadhaar validated on update", () => {
  assert.equal(
    tenantUpdateSchema.safeParse({ params: { id: OID }, body: { address: "1 Main Road" } }).success,
    true
  );
  assert.equal(
    tenantUpdateSchema.safeParse({ params: { id: OID }, body: { aadhaarNumber: "123456789012" } })
      .success,
    true
  );
  assert.equal(
    tenantUpdateSchema.safeParse({ params: { id: OID }, body: { aadhaarNumber: "123" } }).success,
    false
  );
});

// ── Concurrency guards via schema indexes (req 3 / race guard) ──
test("PaymentRequest has a partial-unique pending index per (tenant, month, year)", () => {
  // schema.indexes() → [ [fieldSpec, indexOptions], ... ]
  const found = PaymentRequest.schema
    .indexes()
    .some(
      ([spec, opts]) =>
        spec.tenantId === 1 &&
        spec.paymentMonth === 1 &&
        spec.year === 1 &&
        spec.status === 1 &&
        opts?.unique === true &&
        opts?.partialFilterExpression?.status === "pending"
    );
  assert.equal(found, true);
});

test("ProfileUpdateRequest has a partial-unique pending index per tenant", () => {
  const found = ProfileUpdateRequest.schema
    .indexes()
    .some(
      ([spec, opts]) =>
        spec.tenantId === 1 &&
        spec.status === 1 &&
        opts?.unique === true &&
        opts?.partialFilterExpression?.status === "pending"
    );
  assert.equal(found, true);
});
