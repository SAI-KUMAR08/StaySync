/**
 * Production fix script:
 * - Removes ONLY the truly stale owner: lsk.edu13@gmail.com
 * - Ensures hostelsrirama@gmail.com (current testing admin) exists with Sri Rama hostel + meals
 * - Ensures pravitha.555@gmail.com (future real admin) exists with Sri Rama hostel + meals
 *
 * Run: node scripts/fix-prod-db.js
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const PROD_URI =
  "mongodb+srv://smart-hostel:Srirama1234@cluster0.ucdtgc0.mongodb.net/?appName=Cluster0";
const DB_NAME = "smart-hostel";

// Truly stale - must never exist
const STALE_EMAIL = "lsk.edu13@gmail.com";

// Active admins that need their own hostel + meal data
const ADMINS = [
  {
    email: "hostelsrirama@gmail.com",
    name: "Sri Rama Hostel",
    hostelName: "Sri Rama",
    password: "Srirama@12345",
  },
  {
    email: "pravitha.555@gmail.com",
    name: "Sri Rama",
    hostelName: "Sri Rama",
    password: "Srirama@12345",
  },
];

const mealTypes = [
  { mealType: "breakfast", name: "Breakfast", startTime: "07:30", endTime: "09:30" },
  { mealType: "lunch", name: "Lunch", startTime: "12:30", endTime: "14:30" },
  { mealType: "dinner", name: "Dinner", startTime: "19:30", endTime: "21:30" },
];

const weeklyMenu = {
  0: {
    breakfast: ["Upma", "Chutney"],
    lunch: ["Rice", "Dal", "Pachi Pulusu", "Buttermilk"],
    dinner: ["Bagara Rice", "Chicken Curry", "Buttermilk"],
  },
  1: {
    breakfast: ["Idli", "Chutney"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Chapati", "Veg Curry", "Sambar", "Butter Milk"],
  },
  2: {
    breakfast: ["Bonda", "Chutney"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
  },
  3: {
    breakfast: ["Uttapam / Dosa", "Chutney"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Rice", "Chicken Curry", "Butter Milk"],
  },
  4: {
    breakfast: ["Tomato Rice / Kichidi / Upma", "Chutney"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Chapati", "Veg Curry", "Sambar", "Buttermilk"],
  },
  5: {
    breakfast: ["Poori", "Curry"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
  },
  6: {
    breakfast: ["Poha"],
    lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
    dinner: ["Chapati", "Veg Curry", "Sambar", "Buttermilk"],
  },
};

async function seedMeals(db, owner, hostel) {
  await db.collection("mealtimings").deleteMany({ hostelId: hostel._id });
  let count = 0;
  for (const [dayStr, menu] of Object.entries(weeklyMenu)) {
    for (const mt of mealTypes) {
      await db.collection("mealtimings").insertOne({
        ownerId: owner._id,
        hostelId: hostel._id,
        mealType: mt.mealType,
        name: mt.name,
        items: menu[mt.mealType] || [],
        startTime: mt.startTime,
        endTime: mt.endTime,
        isActive: true,
        dayOfWeek: Number(dayStr),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      count++;
    }
  }
  return count;
}

async function run() {
  await mongoose.connect(PROD_URI, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log("Connected to production DB:", DB_NAME, "\n");

  // -- 1. Remove only the truly stale owner ---------------------------------
  const stale = await db.collection("owners").findOne({ email: STALE_EMAIL });
  if (stale) {
    const hostels = await db.collection("hostels").find({ ownerId: stale._id }).toArray();
    const ids = hostels.map((h) => h._id);
    if (ids.length) {
      const r = await db.collection("mealtimings").deleteMany({ hostelId: { $in: ids } });
      await db.collection("hostels").deleteMany({ _id: { $in: ids } });
      console.log(
        `Deleted ${r.deletedCount} meal timings + ${ids.length} hostel(s) for ${STALE_EMAIL}`
      );
    }
    await db.collection("owners").deleteOne({ _id: stale._id });
    console.log(`Removed stale owner: ${STALE_EMAIL}\n`);
  } else {
    console.log(`Stale owner already clean: ${STALE_EMAIL}\n`);
  }

  // -- 2. Ensure each active admin has owner + hostel + meal timings ---------
  for (const admin of ADMINS) {
    console.log(`-- Processing: ${admin.email}`);

    // Find or create owner
    let owner = await db.collection("owners").findOne({ email: admin.email });
    if (!owner) {
      const hashed = await bcrypt.hash(admin.password, 10);
      const res = await db.collection("owners").insertOne({
        name: admin.name,
        email: admin.email,
        phone: "",
        password: hashed,
        role: "owner",
        isActive: true,
        emailVerified: true,
        loginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      owner = await db.collection("owners").findOne({ _id: res.insertedId });
      console.log(`  Created owner: ${admin.email}`);
    } else {
      console.log(`  Owner exists: ${admin.email} (${owner._id})`);
    }

    // Find or create hostel
    let hostel = await db.collection("hostels").findOne({ ownerId: owner._id });
    if (!hostel) {
      const res = await db.collection("hostels").insertOne({
        ownerId: owner._id,
        name: admin.hostelName,
        address: "",
        city: "",
        isActive: true,
        totalFloors: 1,
        settings: {},
        metadata: {},
        statistics: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      hostel = await db.collection("hostels").findOne({ _id: res.insertedId });
      console.log(`  Created hostel: ${admin.hostelName}`);
    } else {
      console.log(`  Hostel exists: ${hostel.name} (${hostel._id})`);
    }

    // Seed meals
    const count = await seedMeals(db, owner, hostel);
    console.log(`  Seeded ${count} meal timing entries\n`);
  }

  // -- 3. Final state --------------------------------------------------------
  const allOwners = await db.collection("owners").find({}).project({ email: 1, name: 1 }).toArray();
  const totalMeals = await db.collection("mealtimings").countDocuments();
  console.log("-- Final DB state --");
  allOwners.forEach((o) => console.log(`  Owner: ${o.email} (${o.name})`));
  console.log(`  Total meal timings: ${totalMeals}`);

  await mongoose.disconnect();
  console.log("\nDone!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
