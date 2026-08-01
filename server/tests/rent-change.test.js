import { test } from "node:test";
import assert from "node:assert/strict";

const { buildRentChangeNotice } = await import("../src/services/rentChangeService.js");

// ── rent_changed notice message format ──────────────────────
test("buildRentChangeNotice: names the tenant, location, and old → new rent", () => {
  const notice = buildRentChangeNotice({
    tenantName: "Rahul",
    oldRent: 5000,
    newRent: 6000,
    location: "Room 101",
  });

  assert.equal(notice.type, "rent_changed");
  assert.equal(notice.priority, "medium");
  assert.equal(notice.title, "Rent Update");
  assert.equal(
    notice.message,
    "Dear Rahul, your monthly rent for Room 101 has been updated from ₹5000 to ₹6000."
  );
});

test("buildRentChangeNotice: omits the location when none is given", () => {
  const notice = buildRentChangeNotice({
    tenantName: "Priya",
    oldRent: 4500,
    newRent: 4800,
    location: "",
  });
  assert.equal(
    notice.message,
    "Dear Priya, your monthly rent has been updated from ₹4500 to ₹4800."
  );
});
