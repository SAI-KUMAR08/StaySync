import { test } from "node:test";
import assert from "node:assert/strict";

// Set env before importing modules so env.js validation passes.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-1234567890";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-1234567890";

const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
} = await import("../src/utils/tokens.js");

test("access token signs and verifies with the full payload", () => {
  const token = signAccessToken({ userId: "abc", role: "owner", ownerId: "o1", hostelId: "h1" });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.userId, "abc");
  assert.equal(decoded.role, "owner");
  assert.equal(decoded.ownerId, "o1");
  assert.equal(decoded.hostelId, "h1");
});

test("access token lifetime is 15 minutes (C-2)", () => {
  const token = signAccessToken({ userId: "x" });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.exp - decoded.iat, 15 * 60);
});

test("refresh token lifetime is 30 days", () => {
  const token = signRefreshToken({ userId: "x" });
  const decoded = verifyRefreshToken(token);
  assert.equal(decoded.exp - decoded.iat, 30 * 24 * 60 * 60);
});

test("verify rejects malformed / invalid tokens", () => {
  assert.throws(() => verifyAccessToken("not-a-jwt"));
  assert.throws(() => verifyRefreshToken("not-a-jwt"));
});

test("access token is rejected by the refresh verifier (different secrets)", () => {
  const token = signAccessToken({ userId: "x" });
  assert.throws(() => verifyRefreshToken(token));
});

test("refresh tokens are stored as deterministic SHA-256 hashes at rest", () => {
  const token = signRefreshToken({ userId: "x" });
  const hash = hashRefreshToken(token);
  // 64 hex chars = SHA-256.
  assert.match(hash, /^[a-f0-9]{64}$/);
  // Deterministic — the same token always maps to the same hash.
  assert.equal(hashRefreshToken(token), hash);
  // The raw token is never recoverable from the hash (one-way).
  assert.notEqual(hash, token);
});
