import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  mongoose.set("strictQuery", true);
  const dbName = env.MONGO_DB_NAME;
  const maxRetries = 5;
  const retryIntervalMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to MongoDB... (Attempt ${attempt}/${maxRetries})`);
      await mongoose.connect(env.MONGO_URI, {
        dbName,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        family: 4,
      });
      console.log(`✓ MongoDB connected (database: ${mongoose.connection.db.databaseName})`);
      await runSchemaMigration();
      return;
    } catch (error) {

      console.error(`MongoDB connection attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        console.error("\nTroubleshooting steps:");
        console.error("1. Check MongoDB Atlas cluster is ACTIVE (not paused)");
        console.error("2. Whitelist your IP in Network Access");
        console.error("3. Verify credentials in .env file");
        throw new Error(`MongoDB connection failed after ${maxRetries} attempts: ${error.message}`);
      }
      console.log(`Retrying in ${retryIntervalMs / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }
  }
}

async function runSchemaMigration() {
  try {
    console.log("🛠️ Starting database schema migration check...");
    const db = mongoose.connection.db;

    // Drop old indices that conflict with renamed fields
    const dropIndexSafely = async (collectionName, indexName) => {
      try {
        await db.collection(collectionName).dropIndex(indexName);
        console.log(`✓ Dropped old index ${indexName} on ${collectionName}`);
      } catch (e) {
        // Doesn't exist, ignore
      }
    };

    await dropIndexSafely("hostels", "ownerId_1_hostelName_1");
    await dropIndexSafely("floors", "ownerId_1_hostelId_1_level_1");
    await dropIndexSafely("beds", "ownerId_1_hostelId_1_roomId_1_bedLabel_1");
    await dropIndexSafely("tenants", "ownerId_1_hostelId_1_email_1");
    await dropIndexSafely("payments", "ownerId_1_hostelId_1_status_1");
    await dropIndexSafely("payments", "ownerId_1_hostelId_1_year_1_month_1");

    // 1. Migrate Hostels: rename hostelName -> name

    const hostels = await db.collection("hostels").find({ hostelName: { $exists: true } }).toArray();
    if (hostels.length > 0) {
      console.log(`🛠️ Migrating ${hostels.length} hostels (hostelName -> name)...`);
      for (const h of hostels) {
        await db.collection("hostels").updateOne(
          { _id: h._id },
          {
            $set: { name: h.hostelName },
            $unset: { hostelName: "" }
          }
        );
      }
      console.log("✓ Hostels migration complete.");
    }

    // 2. Migrate Floors: rename level -> floorNumber, name -> floorName
    const floors = await db.collection("floors").find({
      $or: [
        { level: { $exists: true } },
        { name: { $exists: true } }
      ]
    }).toArray();
    if (floors.length > 0) {
      console.log(`🛠️ Migrating ${floors.length} floors (level -> floorNumber, name -> floorName)...`);
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
    const rooms = await db.collection("rooms").find({
      $or: [
        { monthlyRent: { $exists: true } },
        { roomType: { $exists: false } }
      ]
    }).toArray();
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
    const beds = await db.collection("beds").find({
      $or: [
        { bedLabel: { $exists: true } },
        { status: { $exists: true } },
        { monthlyRent: { $exists: true } },
        { floorId: { $exists: false } }
      ]
    }).toArray();
    if (beds.length > 0) {
      console.log(`🛠️ Migrating ${beds.length} beds (bedLabel -> bedNumber, status -> occupancyStatus, monthlyRent -> pricing, floorId)...`);
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
    const tenants = await db.collection("tenants").find({
      $or: [
        { name: { $exists: true } },
        { email: { $exists: true } },
        { phone: { $exists: true } },
        { password: { $exists: true } },
        { joinDate: { $exists: true } }
      ]
    }).toArray();
    if (tenants.length > 0) {
      console.log(`🛠️ Migrating ${tenants.length} tenants to personalInfo nested structure...`);
      for (const t of tenants) {
        const update = { $set: {}, $unset: {} };
        
        const name = t.name !== undefined ? t.name : (t.personalInfo?.name);
        const email = t.email !== undefined ? t.email : (t.personalInfo?.email);
        const phone = t.phone !== undefined ? t.phone : (t.personalInfo?.phone);
        const password = t.password !== undefined ? t.password : (t.personalInfo?.password);
        
        update.$set.personalInfo = { name, email, phone, password };
        
        if (t.name !== undefined) update.$unset.name = "";
        if (t.email !== undefined) update.$unset.email = "";
        if (t.phone !== undefined) update.$unset.phone = "";
        if (t.password !== undefined) update.$unset.password = "";
        
        if (t.joinDate !== undefined) {
          update.$set.moveInDate = t.joinDate;
          update.$unset.joinDate = "";
        }
        
        await db.collection("tenants").updateOne({ _id: t._id }, update);
      }
      console.log("✓ Tenants migration complete.");
    }

    // 6. Migrate Payments: month -> paymentMonth, status -> paymentStatus
    const payments = await db.collection("payments").find({
      $or: [
        { month: { $exists: true } },
        { status: { $exists: true } }
      ]
    }).toArray();
    if (payments.length > 0) {
      console.log(`🛠️ Migrating ${payments.length} payments (month -> paymentMonth, status -> paymentStatus)...`);
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

    console.log("✓ Database schema migration check successfully complete!");
  } catch (error) {
    console.error("❌ Schema migration failed:", error);
  }
}


