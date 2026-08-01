import { test } from "node:test";
import assert from "node:assert/strict";

const { tenantCreateSchema, idParamSchema, paymentCreateSchema, assignBedSchema } =
  await import("../src/validators/resources.js");
const { loginSchema } = await import("../src/validators/auth.js");

const OID = "507f1f77bcf86cd799439011";

function parse(schema, body, params = {}, query = {}) {
  return schema.safeParse({ body, query, params });
}

test("tenantCreateSchema accepts a valid tenant payload", () => {
  const res = parse(tenantCreateSchema, {
    name: "Rahul Sharma",
    phone: "9876543210",
    aadhaarNumber: "123456789012",
    address: "123 Main Street",
    emergencyContact: "9876543211",
    sharingType: 2, // the admin selects only a room type
  });
  assert.equal(res.success, true);
});

test("tenantCreateSchema rejects invalid aadhaar / emergency contact / ids", () => {
  const res = parse(tenantCreateSchema, {
    name: "R",
    phone: "98765",
    aadhaarNumber: "123",
    address: "",
    emergencyContact: "123",
    floorId: "not-an-object-id",
    roomId: OID,
    bedId: OID,
  });
  assert.equal(res.success, false);
  // Zod's flatten collapses nested paths to the first segment with message strings.
  const flat = res.error.flatten().fieldErrors;
  assert.ok(Array.isArray(flat.body), "messages should be grouped under body");
  assert.ok(
    flat.body.some((m) => m.includes("Aadhaar")),
    "aadhaarNumber should fail"
  );
  assert.ok(
    flat.body.some((m) => m.includes("Emergency Contact")),
    "emergencyContact should fail"
  );
});

test("tenantCreateSchema requires a room type (sharingType) — admin selects only the room type", () => {
  const base = {
    name: "Rahul Sharma",
    phone: "9876543210",
    aadhaarNumber: "123456789012",
    address: "123 Main Street",
    emergencyContact: "9876543211",
  };
  assert.equal(parse(tenantCreateSchema, base).success, false, "missing sharingType must fail");
  assert.equal(parse(tenantCreateSchema, { ...base, sharingType: 3 }).success, true);
});

test("assignBedSchema accepts a room type (sharingType) for auto room+bed assignment", () => {
  assert.equal(parse(assignBedSchema, { sharingType: 2 }, { id: OID }).success, true);
  assert.equal(
    parse(assignBedSchema, {}, { id: OID }).success,
    false,
    "nothing selected must fail"
  );
});

test("idParamSchema only accepts 24-hex ObjectIds", () => {
  assert.equal(parse(idParamSchema, {}, { id: OID }).success, true);
  assert.equal(parse(idParamSchema, {}, { id: "abc" }).success, false);
});

test("paymentCreateSchema requires a real month + year", () => {
  const base = {
    tenantId: OID,
    amount: 5000,
    year: 2026,
    dueDate: "2026-08-05T00:00:00.000Z",
  };
  assert.equal(parse(paymentCreateSchema, { ...base, paymentMonth: "July" }).success, true);
  assert.equal(parse(paymentCreateSchema, { ...base, paymentMonth: "NotAMonth" }).success, false);
});

test("loginSchema requires email + password", () => {
  assert.equal(parse(loginSchema, { email: "a@b.com", password: "secret1" }).success, true);
  assert.equal(parse(loginSchema, { email: "a@b.com" }).success, false);
  assert.equal(parse(loginSchema, { email: "not-an-email", password: "x" }).success, false);
});
