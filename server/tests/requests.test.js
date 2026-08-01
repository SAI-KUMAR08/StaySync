import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-1234567890";

const { availableBedFilter } = await import("../src/services/occupancyService.js");
const { BED_SHIFT } = await import("../src/utils/constants.js");

// ── Bed hold filter (bed-shift undo window) ──────────────────
test("availableBedFilter: a bed is claimable only when holdUntil is null or expired", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const filter = availableBedFilter(now);

  assert.deepEqual(filter, { $or: [{ holdUntil: null }, { holdUntil: { $lte: now } }] });

  // Simulate Mongo's $or evaluation: a bed matches if any clause matches.
  const matches = (bed) =>
    filter.$or.some((clause) => {
      const [key, val] = Object.entries(clause)[0];
      if (val === null) return bed[key] === null; // holdUntil is null → claimable
      const operator = Object.entries(val)[0]; // { $lte: now }
      if (operator[0] === "$lte") return bed[key] !== null && bed[key] <= operator[1];
      return false;
    });

  assert.equal(matches({ holdUntil: null }), true, "no hold → claimable");
  assert.equal(
    matches({ holdUntil: new Date("2026-08-01T11:59:59.000Z") }),
    true,
    "expired hold → claimable"
  );
  assert.equal(
    matches({ holdUntil: new Date("2026-08-01T12:00:10.000Z") }),
    false,
    "future hold → held"
  );
});

// ── Hold duration covers the undo toast + auto-delete + 30s ──
test("BED_SHIFT.HOLD_RELEASE_MS keeps the old bed held through the undo window plus 30s", () => {
  // Client flow: undo toast (8s) → auto-delete (2s later) → bed released 30s
  // after the toast disappears. The server hold must cover at least 8 + 2 + 30.
  assert.ok(BED_SHIFT.HOLD_RELEASE_MS >= 40_000, "hold must cover the full undo + 30s window");
});
