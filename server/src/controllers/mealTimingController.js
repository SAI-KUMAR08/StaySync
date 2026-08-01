import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import { MealTiming } from "../models/index.js";
import { ownerFilter } from "../utils/scope.js";

const filter = (req) => ownerFilter(req);

/** Broadcast a meal-timing change so tenant/owner meal views update in real time. */
function emitMealTimingChanged(req, timing, action) {
  const io = req.app.get("io");
  const hostelId = timing?.hostelId ?? filter(req).hostelId;
  if (io && hostelId) {
    io.to(`hostel_${hostelId}`).emit("meal_timing_updated", {
      _id: timing?._id,
      action,
      hostelId,
      mealType: timing?.mealType,
      dayOfWeek: timing?.dayOfWeek ?? null,
    });
  }
}

export const listMealTimings = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { mealType, dayOfWeek } = req.query;

  // Validate the day filter — invalid input must 400, not silently coerce to NaN.
  if (dayOfWeek !== undefined) {
    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new AppError("dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)", 400);
    }
    // If requesting a specific day, also include entries with no dayOfWeek (every day)
    const timings = await MealTiming.find({
      ...f,
      isActive: true,
      $or: [{ dayOfWeek: day }, { dayOfWeek: null }],
      ...(mealType ? { mealType } : {}),
    }).sort({ mealType: 1, dayOfWeek: 1 });
    return success(res, timings);
  }

  const query = { ...f, isActive: true };
  if (mealType) query.mealType = mealType;
  const timings = await MealTiming.find(query).sort({ mealType: 1, dayOfWeek: 1 });
  return success(res, timings);
});

export const getMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOne({ _id: req.validated.params.id, ...filter(req) });
  if (!timing) throw new AppError("Meal timing not found", 404);
  return success(res, timing);
});

export const createMealTiming = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { mealType, name, items, startTime, endTime, dayOfWeek } = req.validated.body;
  const timing = await MealTiming.create({
    ...f,
    mealType,
    name: name || mealType.charAt(0).toUpperCase() + mealType.slice(1),
    items: items || [],
    startTime: startTime || "",
    endTime: endTime || "",
    dayOfWeek: dayOfWeek ?? null,
  });
  emitMealTimingChanged(req, timing, "created");
  return success(res, timing, 201);
});

export const updateMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOne({ _id: req.validated.params.id, ...filter(req) });
  if (!timing) throw new AppError("Meal timing not found", 404);
  const { mealType, name, items, startTime, endTime, dayOfWeek, isActive } = req.validated.body;
  if (mealType !== undefined) timing.mealType = mealType;
  if (name !== undefined) timing.name = name;
  if (items !== undefined) timing.items = items;
  if (startTime !== undefined) timing.startTime = startTime;
  if (endTime !== undefined) timing.endTime = endTime;
  if (dayOfWeek !== undefined) timing.dayOfWeek = dayOfWeek;
  if (isActive !== undefined) timing.isActive = isActive;
  await timing.save();
  emitMealTimingChanged(req, timing, "updated");
  return success(res, timing);
});

export const deleteMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOneAndDelete({
    _id: req.validated.params.id,
    ...filter(req),
  });
  if (!timing) throw new AppError("Meal timing not found", 404);
  emitMealTimingChanged(req, timing, "deleted");
  return success(res, { deleted: true });
});
