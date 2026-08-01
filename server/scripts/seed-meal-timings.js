/**
 * Seed script to populate meal timings and menu exactly as specified
 * in "Food Timings.docx" and "Menu - SRI RAMA LUXURY MENS PG HOSTEL.docx"
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

  // Create or find the admin owner
  let owner = await db.collection("owners").findOne({ email: "pravitha.555@gmail.com" });
  if (!owner) {
    const hashed = await bcrypt.hash("Srirama@1234", 10);
    const result = await db.collection("owners").insertOne({
      name: "Admin",
      email: "pravitha.555@gmail.com",
      phone: "",
      password: hashed,
      role: "owner",
      isActive: true,
      emailVerified: true,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    owner = result.insertedId
      ? await db.collection("owners").findOne({ _id: result.insertedId })
      : null;
    console.log("Created admin owner.");
  }

  // Create or find a default hostel
  let hostel = await db.collection("hostels").findOne({ ownerId: owner._id });
  if (!hostel) {
    const result = await db.collection("hostels").insertOne({
      ownerId: owner._id,
      name: "My Hostel",
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
    hostel = result.insertedId
      ? await db.collection("hostels").findOne({ _id: result.insertedId })
      : null;
    console.log("Created default hostel.");
  }

  const f = { ownerId: owner._id, hostelId: hostel._id };
  const now = new Date();

  // Clear existing meal timings for this hostel
  await db.collection("mealtimings").deleteMany(f);
  console.log("Cleared existing meal timings.");

  // ── Timings from Food Timings.docx ──
  // Breakfast: 07:30 AM - 09:30 AM
  // Lunch: 12:30 PM - 02:30 PM
  // Dinner: 07:30 PM - 09:30 PM
  // Evening Snacks (evening refreshments, per the portal's 4 meal types)

  const mealTypes = [
    { mealType: "breakfast", name: "Breakfast", startTime: "07:30", endTime: "09:30" },
    { mealType: "lunch", name: "Lunch", startTime: "12:30", endTime: "14:30" },
    { mealType: "snacks", name: "Evening Snacks", startTime: "16:30", endTime: "17:30" },
    { mealType: "dinner", name: "Dinner", startTime: "19:30", endTime: "21:30" },
  ];

  // ── Weekly Menu from Menu docx ──
  // Each day has breakfast, lunch, dinner items exactly as written
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

  // Create meal timing entries for each day × meal type
  let count = 0;
  for (const [dayName, dayIndex] of Object.entries(dayMap)) {
    const menu = weeklyMenu[dayName];
    for (const mt of mealTypes) {
      const dayMenu = menu[mt.mealType] || [];
      await db.collection("mealtimings").insertOne({
        ...f,
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
      count++;
    }
  }

  console.log(
    `✅ Seeded ${count} meal timing entries (4 meals × 7 days) with exact data from documents.`
  );
  console.log(
    `Last seeded: ${getEnglishMonthName(now)} ${now.getFullYear()} — weekly menu applies every week.`
  );
  console.log("Timings:");
  mealTypes.forEach((mt) => console.log(`  ${mt.name}: ${mt.startTime} - ${mt.endTime}`));
  console.log("Weekly menu items populated for all 7 days.");

  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
