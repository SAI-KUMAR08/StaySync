import mongoose from "mongoose";
import { env } from "./env.js";

/** Exponential backoff (with jitter) between connection attempts. */
function backoffDelay(attempt) {
  const base = 2000;
  const max = 30000;
  const exp = Math.min(base * 2 ** (attempt - 1), max);
  const jitter = Math.floor(exp * 0.2 * Math.random());
  return exp + jitter;
}

/**
 * Index names that are no longer declared in the Mongoose schemas (retired
 * during index cleanup). Dropping them keeps autoIndex from leaving orphans
 * behind in existing databases. Safe to keep listed after they are gone.
 */
const RETIRED_INDEXES = [
  // Old renamed-field indexes (pre-existing)
  ["hostels", "ownerId_1_hostelName_1"],
  ["floors", "ownerId_1_hostelId_1_level_1"],
  ["beds", "ownerId_1_hostelId_1_roomId_1_bedLabel_1"],
  ["tenants", "ownerId_1_hostelId_1_email_1"],
  ["payments", "ownerId_1_hostelId_1_status_1"],
  ["payments", "ownerId_1_hostelId_1_year_1_month_1"],
  ["payments", "tenantId_1_paymentMonth_1_year_1"],
  // Prefix / single-field indexes retired during index cleanup
  ["floors", "ownerId_1_hostelId_1"],
  ["rooms", "ownerId_1"],
  ["rooms", "hostelId_1"],
  ["rooms", "ownerId_1_hostelId_1"],
  ["beds", "ownerId_1"],
  ["beds", "hostelId_1"],
  ["beds", "floorId_1"],
  ["beds", "roomId_1"],
  ["beds", "ownerId_1_hostelId_1"],
  ["payments", "ownerId_1"],
  ["payments", "hostelId_1"],
  ["payments", "tenantId_1"],
  ["payments", "ownerId_1_hostelId_1_paymentStatus_1"],
  ["roomassignmenthistories", "ownerId_1"],
  ["roomassignmenthistories", "hostelId_1"],
  ["roomassignmenthistories", "tenantId_1"],
  ["notices", "ownerId_1"],
  ["notices", "hostelId_1"],
  ["expenses", "ownerId_1"],
  ["expenses", "hostelId_1"],
  ["complaints", "ownerId_1"],
  ["complaints", "hostelId_1"],
  ["complaints", "ownerId_1_hostelId_1_status_1"],
  ["mealtimings", "ownerId_1"],
  ["mealtimings", "hostelId_1"],
  ["paymentrequests", "ownerId_1"],
  ["paymentrequests", "hostelId_1"],
  ["vacaterequests", "ownerId_1"],
  ["vacaterequests", "hostelId_1"],
  ["vacaterequests", "tenantId_1"],
  ["bedshiftrequests", "ownerId_1"],
  ["bedshiftrequests", "hostelId_1"],
];

/** Drop each retired index if it still exists (idempotent, no-op when missing). */
async function dropRetiredIndexes(db) {
  for (const [collectionName, indexName] of RETIRED_INDEXES) {
    try {
      await db.collection(collectionName).dropIndex(indexName);
      console.log(`✓ Dropped retired index ${indexName} on ${collectionName}`);
    } catch {
      // Index doesn't exist, ignore
    }
  }
}

/**
 * Remove duplicate documents within each group key, keeping the newest doc
 * (by `createdAt`, falling back to `_id` which embeds a timestamp) and
 * deleting the rest. Returns the number of documents deleted. Idempotent:
 * re-running with no duplicates is a no-op.
 */
async function dedupKeepNewest(db, collectionName, groupFields) {
  // Dotted paths (e.g. "personalInfo.phone") are only valid as $group VALUES,
  // not as object KEYS — so key the _id by position (key0, key1, ...).
  const groupId = {};
  groupFields.forEach((field, i) => {
    groupId[`key${i}`] = `$${field}`;
  });
  // Null keys (e.g. tenants with no phone) must be excluded — an object _id is
  // never null, so check each key field explicitly.
  const matchOn = groupFields.map((_, i) => ({ [`_id.key${i}`]: { $ne: null } }));
  const groups = await db
    .collection(collectionName)
    .aggregate([
      { $group: { _id: groupId, docs: { $push: { _id: "$_id", createdAt: "$createdAt" } } } },
      // Skip null-key groups and groups with < 2 docs
      { $match: { $and: matchOn, "docs.1": { $exists: true } } },
    ])
    .toArray();

  let deleted = 0;
  for (const group of groups) {
    group.docs.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return String(a._id).localeCompare(String(b._id));
    });
    // docs are sorted oldest -> newest; pop the newest to keep, delete the rest
    group.docs.pop();
    const dupIds = group.docs.map((d) => d._id);
    if (dupIds.length > 0) {
      const result = await db.collection(collectionName).deleteMany({ _id: { $in: dupIds } });
      deleted += result.deletedCount || 0;
    }
  }
  return deleted;
}

export async function connectDB() {
  mongoose.set("strictQuery", true);
  const dbName = env.MONGO_DB_NAME;
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to MongoDB... (Attempt ${attempt}/${maxRetries})`);
      await mongoose.connect(env.MONGO_URI, {
        dbName,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        family: 4,
        bufferCommands: false, // fail fast instead of silent 10s timeout
      });
      console.log(`✓ MongoDB connected (database: ${mongoose.connection.db.databaseName})`);
      if (env.RUN_MIGRATIONS) {
        await runSchemaMigration();
      } else {
        console.log(
          "🛠️ Schema migration skipped (set RUN_MIGRATIONS=true to enable). Dropping stale indices only."
        );
        // Always drop conflicting old indices regardless of migration flag
        await dropRetiredIndexes(mongoose.connection.db);
      }
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        console.error("\nTroubleshooting steps:");
        console.error("1. Check MongoDB Atlas cluster is ACTIVE (not paused)");
        console.error("2. Whitelist your IP in Network Access");
        console.error("3. Verify credentials in .env file");
        throw new Error(
          `MongoDB connection failed after ${maxRetries} attempts: ${error.message}`,
          { cause: error }
        );
      }
      const delay = backoffDelay(attempt);
      console.log(`Retrying in ${Math.round(delay / 1000)} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function runSchemaMigration() {
  try {
    console.log("🛠️ Starting database schema migration check...");
    const db = mongoose.connection.db;

    // Drop old/retired indices that conflict with the current schema.
    // Must run before autoIndex (re)builds so no orphan indexes are left.
    await dropRetiredIndexes(db);

    // 1. Migrate Hostels: rename hostelName -> name

    const hostels = await db
      .collection("hostels")
      .find({ hostelName: { $exists: true } })
      .toArray();
    if (hostels.length > 0) {
      console.log(`🛠️ Migrating ${hostels.length} hostels (hostelName -> name)...`);
      for (const h of hostels) {
        await db.collection("hostels").updateOne(
          { _id: h._id },
          {
            $set: { name: h.hostelName },
            $unset: { hostelName: "" },
          }
        );
      }
      console.log("✓ Hostels migration complete.");
    }

    // 2. Migrate Floors: rename level -> floorNumber, name -> floorName
    const floors = await db
      .collection("floors")
      .find({
        $or: [{ level: { $exists: true } }, { name: { $exists: true } }],
      })
      .toArray();
    if (floors.length > 0) {
      console.log(
        `🛠️ Migrating ${floors.length} floors (level -> floorNumber, name -> floorName)...`
      );
      for (const f of floors) {
        const update = { $set: {}, $unset: {} };
        if (f.level !== undefined) {
          update.$set.floorNumber = f.level;
          update.$unset.level = "";
        }
        if (f.name !== undefined) {
          update.$set.floorName = f.name;
          update.$unset.name = "";
        }
        await db.collection("floors").updateOne({ _id: f._id }, update);
      }
      console.log("✓ Floors migration complete.");
    }

    // 3. Migrate Rooms: rename monthlyRent -> pricing, populate roomType from amenities
    const rooms = await db
      .collection("rooms")
      .find({
        $or: [{ monthlyRent: { $exists: true } }, { roomType: { $exists: false } }],
      })
      .toArray();
    if (rooms.length > 0) {
      console.log(`🛠️ Migrating ${rooms.length} rooms (monthlyRent -> pricing, roomType)...`);
      for (const r of rooms) {
        const update = { $set: {}, $unset: {} };
        if (r.monthlyRent !== undefined) {
          update.$set.pricing = r.monthlyRent;
          update.$unset.monthlyRent = "";
        }
        if (!r.roomType) {
          const hasAC = r.amenities?.includes("AC");
          update.$set.roomType = hasAC ? "AC" : "Non-AC";
        }
        await db.collection("rooms").updateOne({ _id: r._id }, update);
      }
      console.log("✓ Rooms migration complete.");
    }

    // 4. Migrate Beds: rename bedLabel -> bedNumber, status -> occupancyStatus, monthlyRent -> pricing, and add floorId if missing
    const beds = await db
      .collection("beds")
      .find({
        $or: [
          { bedLabel: { $exists: true } },
          { status: { $exists: true } },
          { monthlyRent: { $exists: true } },
          { floorId: { $exists: false } },
        ],
      })
      .toArray();
    if (beds.length > 0) {
      console.log(
        `🛠️ Migrating ${beds.length} beds (bedLabel -> bedNumber, status -> occupancyStatus, monthlyRent -> pricing, floorId)...`
      );
      for (const b of beds) {
        const update = { $set: {}, $unset: {} };
        if (b.bedLabel !== undefined) {
          update.$set.bedNumber = b.bedLabel;
          update.$unset.bedLabel = "";
        }
        if (b.status !== undefined) {
          update.$set.occupancyStatus = b.status;
          update.$unset.status = "";
        }
        if (b.monthlyRent !== undefined) {
          update.$set.pricing = b.monthlyRent;
          update.$unset.monthlyRent = "";
        }

        // Populate floorId from room if missing
        if (!b.floorId) {
          const room = await db.collection("rooms").findOne({ _id: b.roomId });
          if (room && room.floorId) {
            update.$set.floorId = room.floorId;
          }
        }

        await db.collection("beds").updateOne({ _id: b._id }, update);
      }
      console.log("✓ Beds migration complete.");
    }

    // 5. Migrate Tenants: root fields -> personalInfo subdoc, joinDate -> moveInDate
    const tenants = await db
      .collection("tenants")
      .find({
        $or: [
          { name: { $exists: true } },
          { email: { $exists: true } },
          { phone: { $exists: true } },
          { password: { $exists: true } },
          { joinDate: { $exists: true } },
        ],
      })
      .toArray();
    if (tenants.length > 0) {
      console.log(`🛠️ Migrating ${tenants.length} tenants to personalInfo nested structure...`);
      for (const t of tenants) {
        const update = { $set: {}, $unset: {} };

        const name = t.name !== undefined ? t.name : t.personalInfo?.name;
        const email = t.email !== undefined ? t.email : t.personalInfo?.email;
        const phone = t.phone !== undefined ? t.phone : t.personalInfo?.phone;
        const password = t.password !== undefined ? t.password : t.personalInfo?.password;

        // Per-field $set so other personalInfo subfields (address, emergencyContact,
        // aadhaarNumber, ...) are not clobbered by a whole-subdocument replace.
        if (name !== undefined) update.$set["personalInfo.name"] = name;
        if (email !== undefined) update.$set["personalInfo.email"] = email;
        if (phone !== undefined) update.$set["personalInfo.phone"] = phone;
        if (password !== undefined) update.$set["personalInfo.password"] = password;

        if (t.name !== undefined) update.$unset.name = "";
        if (t.email !== undefined) update.$unset.email = "";
        if (t.phone !== undefined) update.$unset.phone = "";
        if (t.password !== undefined) update.$unset.password = "";

        if (t.joinDate !== undefined) {
          update.$set.moveInDate = t.joinDate;
          update.$unset.joinDate = "";
        }

        if (Object.keys(update.$set).length === 0) delete update.$set;
        if (Object.keys(update.$unset).length === 0) delete update.$unset;

        await db.collection("tenants").updateOne({ _id: t._id }, update);
      }
      console.log("✓ Tenants migration complete.");
    }

    // Dedup tenants by personalInfo.phone BEFORE the new unique phone index builds.
    // Runs after the field migration so legacy root-level phone values are covered.
    const tenantsDeduped = await dedupKeepNewest(db, "tenants", ["personalInfo.phone"]);
    if (tenantsDeduped > 0) {
      console.log(`✓ Tenant phone dedup complete: removed ${tenantsDeduped} duplicate tenant(s).`);
    }

    // Rename isPasswordSet -> doesPassCreated (field rename). $rename preserves
    // existing values; a second run is a no-op for docs that no longer have the
    // old field.
    const passFlagRenamed = await db
      .collection("tenants")
      .updateMany(
        { isPasswordSet: { $exists: true } },
        { $rename: { isPasswordSet: "doesPassCreated" } }
      );
    if (passFlagRenamed.modifiedCount > 0 || passFlagRenamed.matchedCount > 0) {
      console.log(
        `✓ Tenant field migration: isPasswordSet -> doesPassCreated (${passFlagRenamed.modifiedCount} updated).`
      );
    }

    // 6. Migrate Payments: month -> paymentMonth, status -> paymentStatus
    const payments = await db
      .collection("payments")
      .find({
        $or: [{ month: { $exists: true } }, { status: { $exists: true } }],
      })
      .toArray();
    if (payments.length > 0) {
      console.log(
        `🛠️ Migrating ${payments.length} payments (month -> paymentMonth, status -> paymentStatus)...`
      );
      for (const p of payments) {
        const update = { $set: {}, $unset: {} };
        if (p.month !== undefined) {
          update.$set.paymentMonth = p.month;
          update.$unset.month = "";
        }
        if (p.status !== undefined) {
          update.$set.paymentStatus = p.status;
          update.$unset.status = "";
        }
        await db.collection("payments").updateOne({ _id: p._id }, update);
      }
      console.log("✓ Payments migration complete.");
    }

    // Dedup payments BEFORE the unique invoice index
    // (tenantId, paymentMonth, year, paymentType) builds. Runs after the field
    // migration so legacy month/status field names are covered.
    const paymentsDeduped = await dedupKeepNewest(db, "payments", [
      "tenantId",
      "paymentMonth",
      "year",
      "paymentType",
    ]);
    if (paymentsDeduped > 0) {
      console.log(`✓ Payment dedup complete: removed ${paymentsDeduped} duplicate invoice(s).`);
    }

    console.log("✓ Database schema migration check successfully complete!");
  } catch (error) {
    console.error("❌ Schema migration failed:", error);
  }
}
