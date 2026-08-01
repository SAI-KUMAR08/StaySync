/**
 * One-time repair (user-approved): make the room rent authoritative for every
 * active tenant.
 *
 * Finds active tenants whose monthlyRent differs from the price of the room
 * they are allotted to, backs them up to a JSON file, sets monthlyRent to the
 * room price, and creates a "rent updated" inbox notification for each.
 *
 * Run: node scripts/sync-tenant-rents.js
 * (idempotent — tenants already matching their room price are untouched)
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { Tenant, Notification } from "../src/models/index.js";
import { buildRentChangeNotice } from "../src/services/rentChangeService.js";
config();

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "smart-hostel";
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 60000 });

  const tenants = await Tenant.find({ isActive: true })
    .populate("roomId", "roomNumber pricing")
    .lean();

  const changes = [];
  for (const t of tenants) {
    const room = t.roomId;
    if (!room) continue;
    const roomPrice = Number(room.pricing);
    if (!Number.isFinite(roomPrice) || roomPrice < 0) continue;
    const current = Number(t.monthlyRent) || 0;
    if (current === roomPrice) continue; // already matches — leave alone
    changes.push({
      tenantId: t._id.toString(),
      name: t.personalInfo?.name || t.name || "Unknown",
      roomNumber: room.roomNumber,
      oldRent: current,
      newRent: roomPrice,
    });
  }

  if (changes.length === 0) {
    console.log("✅ No active tenant has a rent that differs from their room's rent.");
    await mongoose.disconnect();
    return;
  }

  // Backup first, so the change is fully reversible.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `scripts/backup-tenant-rents-${stamp}.json`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(backupPath, JSON.stringify(changes, null, 2));
  console.log(`📦 Backed up ${changes.length} row(s) to ${backupPath}`);

  for (const c of changes) {
    await Tenant.updateOne({ _id: c.tenantId }, { $set: { monthlyRent: c.newRent } });
    const t = tenants.find((x) => String(x._id) === c.tenantId);
    if (t) {
      const notice = buildRentChangeNotice({
        tenantName: c.name,
        oldRent: c.oldRent,
        newRent: c.newRent,
        location: `Room ${c.roomNumber}`,
      });
      await Notification.create({
        ownerId: t.ownerId,
        hostelId: t.hostelId,
        tenantId: t._id,
        type: "rent",
        title: "Your rent has been updated",
        message: notice.message,
      });
    }
  }

  console.log(`✏️  Updated ${changes.length} tenant(s) to match their room rent:`);
  for (const c of changes) {
    console.log(`   • ${c.name} (Room ${c.roomNumber}): ₹${c.oldRent} → ₹${c.newRent}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("sync-tenant-rents failed:", e);
  process.exit(1);
});
