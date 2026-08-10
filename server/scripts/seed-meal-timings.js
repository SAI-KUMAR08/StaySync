/**
 * Seed script to populate meal timings and menu exactly as specified
 * in "Food Timings.docx" and "Menu - SRI RAMA LUXURY MENS PG HOSTEL.docx"
 * for ALL hostels in the system.
 *
 * Run: node scripts/seed-meal-timings.js
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { getEnglishMonthName } from "../src/utils/date.js";
config();

async function seed() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "smart-hostel";
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;

  // Find all owners or default admin
  let owner = await db.collection("owners").findOne({ email: "lsk.edu13@gmail.com" });
  if (!owner) {
    const hashed = await bcrypt.hash("Srirama@1234", 10);
    const result = await db.collection("owners").insertOne({
      name: "Admin",
      email: "lsk.edu13@gmail.com",
      phone: "",
      password: hashed,
      role: "owner",
      isActive: true,
      emailVerified: true,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    owner = await db.collection("owners").findOne({ _id: result.insertedId });
    console.log("Created admin owner.");
  }

  // Get ALL hostels
  let hostels = await db.collection("hostels").find({}).toArray();
  if (hostels.length === 0) {
    const result = await db.collection("hostels").insertOne({
      ownerId: owner._id,
      name: "Sri Rama",
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
    hostels = [await db.collection("hostels").findOne({ _id: result.insertedId })];
    console.log("Created default hostel.");
  }

  const now = new Date();

  // ── Timings from Food Timings.docx ──
  const mealTypes = [
    { mealType: "breakfast", name: "Breakfast", startTime: "07:30", endTime: "09:30" },
    { mealType: "lunch", name: "Lunch", startTime: "12:30", endTime: "14:30" },
    { mealType: "snacks", name: "Evening Snacks", startTime: "16:30", endTime: "17:30" },
    { mealType: "dinner", name: "Dinner", startTime: "19:30", endTime: "21:30" },
  ];

  // ── Weekly Menu from Menu docx ──
  const weeklyMenu = {
    sunday: {
      breakfast: ["Upma", "Chutney"],
      lunch: ["Rice", "Dal", "Pachi Pulusu", "Buttermilk"],
      snacks: ["Tea", "Biscuits", "Mixture"],
      dinner: ["Bagara Rice", "Chicken Curry", "Buttermilk"],
    },
    monday: {
      breakfast: ["Idli", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Tea", "Samosa"],
      dinner: ["Chapati", "Veg Curry", "Sambar", "Butter Milk"],
    },
    tuesday: {
      breakfast: ["Bonda", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Coffee", "Biscuits", "Mixture"],
      dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
    },
    wednesday: {
      breakfast: ["Uttapam/ Dosa", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Tea", "Vada", "Chutney"],
      dinner: ["Rice", "Chicken Curry", "Butter Milk"],
    },
    thursday: {
      breakfast: ["Tomato Rice / Kichidi / Upma", "Chutney"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Coffee", "Biscuits", "Mixture"],
      dinner: ["Chapati", "Veg Curry", "Sambar", "Buttermilk"],
    },
    friday: {
      breakfast: ["Poori", "Curry"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Tea", "Pakora"],
      dinner: ["Rice", "Egg", "Rasam", "Buttermilk"],
    },
    saturday: {
      breakfast: ["Poha"],
      lunch: ["Rice", "Veg Curry", "Dal", "Buttermilk"],
      snacks: ["Coffee", "Biscuits", "Mixture"],
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
    const filter = { hostelId: hostel._id };
    await db.collection("mealtimings").deleteMany(filter);

    const ownerId = hostel.ownerId || owner._id;

    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      const menu = weeklyMenu[dayName];
      for (const mt of mealTypes) {
        const dayMenu = menu[mt.mealType] || [];
        await db.collection("mealtimings").insertOne({
          ownerId,
          hostelId: hostel._id,
          mealType: mt.mealType,
          name: mt.name,
          items: dayMenu,
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
    console.log(`Seeded 28 meal timing entries for hostel "${hostel.name}" (${hostel._id})`);
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
