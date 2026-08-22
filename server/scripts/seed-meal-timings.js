/**
 * Seed script to populate meal timings and menu exactly as specified.
 * - Removes the stale "lsk.edu13@gmail.com" owner and its orphaned data.
 * - Seeds meal timings under the real admin (hostelsrirama@gmail.com).
 *
 * Run: node scripts/seed-meal-timings.js
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

const STALE_EMAIL = "lsk.edu13@gmail.com";
const REAL_ADMIN_EMAIL = "pravitha.555@gmail.com";

async function seed() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "smart-hostel";
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;

  // ── 1. Remove stale owner and its orphaned data ──────────────────────────
  const staleOwner = await db.collection("owners").findOne({ email: STALE_EMAIL });
  if (staleOwner) {
    const staleHostels = await db.collection("hostels").find({ ownerId: staleOwner._id }).toArray();
    const staleHostelIds = staleHostels.map((h) => h._id);

    if (staleHostelIds.length > 0) {
      const r = await db
        .collection("mealtimings")
        .deleteMany({ hostelId: { $in: staleHostelIds } });
      console.log(`  Deleted ${r.deletedCount} stale meal timing(s) for ${STALE_EMAIL}`);
      await db.collection("hostels").deleteMany({ _id: { $in: staleHostelIds } });
      console.log(`  Deleted ${staleHostelIds.length} stale hostel(s) for ${STALE_EMAIL}`);
    }

    await db.collection("owners").deleteOne({ _id: staleOwner._id });
    console.log(`✅ Removed stale owner: ${STALE_EMAIL}`);
  } else {
    console.log(`ℹ️  Stale owner ${STALE_EMAIL} not found — nothing to remove.`);
  }

  // ── 2. Find real admin owner ─────────────────────────────────────────────
  const owner = await db.collection("owners").findOne({ email: REAL_ADMIN_EMAIL });
  if (!owner) {
    console.error(
      `❌ Real admin "${REAL_ADMIN_EMAIL}" not found. Please ensure the admin account exists.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Found real admin: ${REAL_ADMIN_EMAIL} (${owner._id})`);

  // ── 3. Find hostels belonging to the real admin ──────────────────────────
  const hostels = await db.collection("hostels").find({ ownerId: owner._id }).toArray();

  if (hostels.length === 0) {
    console.error(`❌ No hostels found for owner "${REAL_ADMIN_EMAIL}". Cannot seed.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Meal timings ─────────────────────────────────────────────────────────
  const mealTypes = [
    { mealType: "breakfast", name: "Breakfast", startTime: "07:30", endTime: "09:30" },
    { mealType: "lunch", name: "Lunch", startTime: "12:30", endTime: "14:30" },
    { mealType: "dinner", name: "Dinner", startTime: "19:30", endTime: "21:30" },
  ];

  // ── Weekly Menu ──────────────────────────────────────────────────────────
  const weeklyMenu = {
    sunday: {
      breakfast: ["Upma", "Chutney"],
      lunch: ["Rice", "Dal", "Pachi Pulusu", "Buttermilk"],
      dinner: ["Bagara Rice", "Chicken Curry", "Buttermilk"],
    },
    monday: {
      breakfast: ["Idli", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Chapati", "Veg Curry", "Sambar", "Butter Milk"],
    },
    tuesday: {
      breakfast: ["Bonda", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
    },
    wednesday: {
      breakfast: ["Uttapam / Dosa", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Rice", "Chicken Curry", "Butter Milk"],
    },
    thursday: {
      breakfast: ["Tomato Rice / Kichidi / Upma", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Chapati", "Veg Curry", "Sambar", "Buttermilk"],
    },
    friday: {
      breakfast: ["Poori", "Curry"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
    },
    saturday: {
      breakfast: ["Poha"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      dinner: ["Chapati", "Veg Curry", "Sambar", "Buttermilk"],
    },
  };

  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  let totalCount = 0;

  for (const hostel of hostels) {
    // Clear existing meal timings for this hostel only
    await db.collection("mealtimings").deleteMany({ hostelId: hostel._id });

    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      const menu = weeklyMenu[dayName];
      for (const mt of mealTypes) {
        await db.collection("mealtimings").insertOne({
          ownerId: hostel.ownerId,
          hostelId: hostel._id,
          mealType: mt.mealType,
          name: mt.name,
          items: menu[mt.mealType] || [],
          startTime: mt.startTime,
          endTime: mt.endTime,
          isActive: true,
          dayOfWeek: dayIndex,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        totalCount++;
      }
    }
    console.log(`✅ Seeded 21 meal timing entries for hostel "${hostel.name}" (${hostel._id})`);
  }

  console.log(
    `\n✅ Total Seeded: ${totalCount} meal timing entries across ${hostels.length} hostel(s).`
  );

  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
