import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-1234567890";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-1234567890";

const { validate } = await import("../src/middleware/validate.js");
const { errorHandler, AppError } = await import("../src/middleware/error.middleware.js");
const { authenticate, tenantScope, ownerScope } = await import("../src/middleware/auth.js");
const { signAccessToken } = await import("../src/utils/tokens.js");
const { tenantCreateSchema } = await import("../src/validators/resources.js");

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.body = obj;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
    return res;
  };
  return res;
}

test("validate: passes a valid payload and sets req.validated", () => {
  let calledNext = false;
  const req = {
    body: {
      name: "Rahul Sharma",
      phone: "9876543210",
      aadhaarNumber: "123456789012",
      address: "123 Main Street",
      emergencyContact: "9876543211",
      sharingType: 2,
    },
    query: {},
    params: {},
  };
  validate(tenantCreateSchema)(req, mockRes(), () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.ok(req.validated?.body?.name);
});

test("validate: rejects with normalized FLAT fieldErrors (M-9)", () => {
  const res = mockRes();
  const req = {
    body: {
      name: "Rahul Sharma",
      phone: "9876543210",
      aadhaarNumber: "123", // invalid
      address: "", // invalid
      emergencyContact: "123", // invalid
      floorId: "507f1f77bcf86cd799439011",
      roomId: "507f1f77bcf86cd799439011",
      bedId: "507f1f77bcf86cd799439011",
    },
    query: {},
    params: {},
  };
  validate(tenantCreateSchema)(req, res, () => {});
  assert.equal(res.statusCode, 400);
  // fieldErrors keys are FIELD names (flat), not "body"/"query"/"params".
  assert.ok(res.body.errors.fieldErrors.aadhaarNumber);
  assert.ok(res.body.errors.fieldErrors.address);
  assert.ok(res.body.errors.fieldErrors.emergencyContact);
  assert.equal(res.body.errors.fieldErrors.body, undefined);
});

test("errorHandler: preserves intentional AppError messages", () => {
  const res = mockRes();
  const req = { id: "req-123", headers: {} };
  errorHandler(new AppError("Tenant not found", 404), req, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Tenant not found");
});

test("errorHandler: hides internal details of unhandled 500s in production (L-13)", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = mockRes();
    const req = { id: "req-123", headers: {} };
    errorHandler(
      new Error("connection string mongodb://user:pass@secret-host"),
      req,
      res,
      () => {}
    );
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Internal Server Error");
    assert.equal(res.body.stack, undefined);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("authenticate: rejects missing token", () => {
  const res = mockRes();
  const req = { headers: {} };
  let err;
  authenticate(req, res, (e) => {
    err = e;
  });
  assert.equal(err.statusCode, 401);
});

test("authenticate: sets req.user from a valid token", () => {
  const token = signAccessToken({ userId: "u1", role: "owner", ownerId: "o1", hostelId: "h1" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let err;
  authenticate(req, mockRes(), (e) => {
    err = e;
  });
  assert.equal(err, undefined); // no error passed to next()
  assert.equal(req.user.id, "u1");
  assert.equal(req.user.role, "owner");
  assert.equal(req.user.ownerId, "o1");
  assert.equal(req.user.hostelId, "h1");
});

test("authenticate: rejects tokens without ownerId scoping or with bad role (H-2)", () => {
  const noScope = signAccessToken({ userId: "u1", role: "owner" });
  const req1 = { headers: { authorization: `Bearer ${noScope}` } };
  let err1;
  authenticate(req1, mockRes(), (e) => {
    err1 = e;
  });
  assert.equal(err1.statusCode, 401);

  const badRole = signAccessToken({ userId: "u1", role: "manager", ownerId: "o1", hostelId: "h1" });
  const req2 = { headers: { authorization: `Bearer ${badRole}` } };
  let err2;
  authenticate(req2, mockRes(), (e) => {
    err2 = e;
  });
  assert.equal(err2.statusCode, 401);
});

test("ownerScope / tenantScope build the right filters", () => {
  const ownerReq = { user: { id: "o1", role: "owner", hostelId: "h1" } };
  ownerScope(ownerReq, mockRes(), () => {});
  assert.equal(ownerReq.ownerFilter.ownerId.toString(), "o1");

  const tenantReq = { user: { id: "t1", role: "tenant", ownerId: "o1", hostelId: "h1" } };
  tenantScope(tenantReq, mockRes(), () => {});
  assert.equal(tenantReq.tenantFilter.tenantId, "t1");
  assert.equal(tenantReq.tenantFilter.ownerId, "o1");
});
