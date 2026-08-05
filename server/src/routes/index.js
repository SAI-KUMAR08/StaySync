import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import authRoutes from "./authRoutes.js";
import ownerRoutes from "./ownerRoutes.js";
import tenantRoutes from "./tenantRoutes.js";

const router = Router();

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

router.get("/health", async (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  let dbInfo = {};
  if (dbOk) {
    try {
      const db = mongoose.connection.db;
      const dbName = db.databaseName;
      const ownerCount = await db.collection("owners").countDocuments();
      const hostelCount = await db.collection("hostels").countDocuments();
      const mealCount = await db.collection("mealtimings").countDocuments();
      const hostels = await db
        .collection("hostels")
        .find({}, { projection: { name: 1 } })
        .toArray();
      dbInfo = {
        dbName,
        ownerCount,
        hostelCount,
        mealCount,
        hostelNames: hostels.map((h) => h.name),
      };
    } catch (e) {
      dbInfo = { error: e.message };
    }
  }

  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? "MyHostel API is running" : "Database unavailable",
    db: DB_STATES[mongoose.connection.readyState] ?? "unknown",
    uptime: process.uptime(),
    ...dbInfo,
  });
});

// ONE-TIME SEED ENDPOINT FOR VERCEL PRODUCTION DATABASE
router.get("/admin-seed-db", async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // 1. Wipe all collections in production DB
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      await db.collection(col.name).deleteMany({});
    }

    // 2. Create fresh Owner
    const hashedPassword = await bcrypt.hash("Srirama@1234", 10);
    const ownerInsert = await db.collection("owners").insertOne({
      name: "Sri Rama",
      email: "pravitha.555@gmail.com",
      phone: "9999999999",
      password: hashedPassword,
      role: "owner",
      ownerId: null,
      hostelId: null,
      isActive: true,
      emailVerified: true,
      loginAttempts: 0,
      lockUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ownerId = ownerInsert.insertedId;

    // 3. Create fresh Hostel
    const hostelInsert = await db.collection("hostels").insertOne({
      ownerId,
      name: "Sri Rama",
      address: "Hostel Address",
      city: "City",
      totalFloors: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const hostelId = hostelInsert.insertedId;

    // 4. Update owner hostelId
    await db
      .collection("owners")
      .updateOne({ _id: ownerId }, { $set: { hostelId, updatedAt: new Date() } });

    // 5. Seed Meal Timings
    const mealTypes = [
      { mealType: "breakfast", name: "Breakfast", startTime: "07:30", endTime: "09:30" },
      { mealType: "lunch", name: "Lunch", startTime: "12:30", endTime: "14:30" },
      { mealType: "snacks", name: "Evening Snacks", startTime: "16:30", endTime: "17:30" },
      { mealType: "dinner", name: "Dinner", startTime: "19:30", endTime: "21:30" },
    ];

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

    let count = 0;
    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      const menu = weeklyMenu[dayName];
      for (const mt of mealTypes) {
        const dayMenu = menu[mt.mealType] || [];
        await db.collection("mealtimings").insertOne({
          ownerId,
          hostelId,
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

    res.json({
      success: true,
      message: `Production DB wiped and seeded ${count} meals for hostel Sri Rama`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.use("/auth", authRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);

export default router;
