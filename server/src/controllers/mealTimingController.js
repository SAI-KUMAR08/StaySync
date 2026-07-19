import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import { MealTiming } from "../models/index.js";
import { ownerFilter } from "../utils/scope.js";

const filter = (req) => ownerFilter(req);

export const listMealTimings = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { mealType, dayOfWeek } = req.query;
  const query = { ...f, isActive: true };
  if (mealType) query.mealType = mealType;
  if (dayOfWeek !== undefined) query.dayOfWeek = Number(dayOfWeek);
  // If requesting a specific day, also include entries with no dayOfWeek (every day)
  if (dayOfWeek !== undefined) {
    const timings = await MealTiming.find({
      ...f,
      isActive: true,
      $or: [{ dayOfWeek: Number(dayOfWeek) }, { dayOfWeek: null }],
      ...(mealType ? { mealType } : {}),
    }).sort({ mealType: 1, dayOfWeek: 1 });
    return success(res, timings);
  }
  const timings = await MealTiming.find(query).sort({ mealType: 1, dayOfWeek: 1 });
  return success(res, timings);
});

export const getMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOne({ _id: req.params.id, ...filter(req) });
  if (!timing) throw new AppError("Meal timing not found", 404);
  return success(res, timing);
});

export const createMealTiming = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { mealType, name, items, startTime, endTime, dayOfWeek } = req.body;
  const timing = await MealTiming.create({
    ...f,
    mealType,
    name: name || mealType.charAt(0).toUpperCase() + mealType.slice(1),
    items: items || [],
    startTime: startTime || "",
    endTime: endTime || "",
    dayOfWeek: dayOfWeek ?? null,
  });
  return success(res, timing, 201);
});

export const updateMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOne({ _id: req.params.id, ...filter(req) });
  if (!timing) throw new AppError("Meal timing not found", 404);
  const { mealType, name, items, startTime, endTime, dayOfWeek, isActive } = req.body;
  if (mealType !== undefined) timing.mealType = mealType;
  if (name !== undefined) timing.name = name;
  if (items !== undefined) timing.items = items;
  if (startTime !== undefined) timing.startTime = startTime;
  if (endTime !== undefined) timing.endTime = endTime;
  if (dayOfWeek !== undefined) timing.dayOfWeek = dayOfWeek;
  if (isActive !== undefined) timing.isActive = isActive;
  await timing.save();
  return success(res, timing);
});

export const deleteMealTiming = asyncHandler(async (req, res) => {
  const timing = await MealTiming.findOneAndDelete({ _id: req.params.id, ...filter(req) });
  if (!timing) throw new AppError("Meal timing not found", 404);
  return success(res, { deleted: true });
});
