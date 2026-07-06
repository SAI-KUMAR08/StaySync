import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import Expense from "../models/Expense.js";
import { ownerFilter } from "../utils/scope.js";
import { escapeRegex } from "../utils/regex.js";

const filter = (req) => ownerFilter(req);

export const listExpenses = asyncHandler(async (req, res) => {
  const query = { ...filter(req) };
  const { category, startDate, endDate, search } = req.query;

  if (category) query.category = category;
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  if (search?.trim()) {
    query.description = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const expenses = await Expense.find(query)
    .populate("hostelId", "hostelName")
    .sort({ date: -1, createdAt: -1 });

  return success(res, expenses);
});

export const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ _id: req.validated.params.id, ...filter(req) })
    .populate("hostelId", "hostelName");
  if (!expense) throw new AppError("Expense not found", 404);
  return success(res, expense);
});

export const createExpense = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { category, amount, description, date, paymentMethod, vendor, isRecurring } = req.validated.body;

  const expense = await Expense.create({
    ownerId: f.ownerId,
    hostelId: f.hostelId,
    category,
    amount,
    description: description?.trim(),
    date: date || new Date(),
    paymentMethod: paymentMethod || "cash",
    vendor: vendor?.trim() || "",
    isRecurring: isRecurring || false,
  });

  return success(res, expense, 201);
});

export const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ _id: req.validated.params.id, ...filter(req) });
  if (!expense) throw new AppError("Expense not found", 404);

  const { category, amount, description, date, paymentMethod, vendor, isRecurring } = req.validated.body;
  if (category !== undefined) expense.category = category;
  if (amount !== undefined) expense.amount = amount;
  if (description !== undefined) expense.description = description?.trim();
  if (date !== undefined) expense.date = date;
  if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
  if (vendor !== undefined) expense.vendor = vendor?.trim();
  if (isRecurring !== undefined) expense.isRecurring = isRecurring;

  await expense.save();
  return success(res, expense);
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete({ _id: req.validated.params.id, ...filter(req) });
  if (!expense) throw new AppError("Expense not found", 404);
  return success(res, { deleted: true });
});

export const getExpenseSummary = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { startDate, endDate } = req.query;

  const match = { ownerId: f.ownerId, hostelId: f.hostelId };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const summary = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const totalExpenses = summary.reduce((acc, s) => acc + s.total, 0);
  const thisMonth = await Expense.aggregate([
    {
      $match: {
        ...match,
        date: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          $lte: new Date(),
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return success(res, {
    categories: summary,
    totalExpenses,
    thisMonthTotal: thisMonth[0]?.total || 0,
    count: summary.reduce((acc, s) => acc + s.count, 0),
  });
});
