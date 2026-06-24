export class AppError extends Error {
  constructor(message, statusCode = 400, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = "AppError";
  }
}

import { applyCorsHeaders } from "../utils/corsOrigins.js";

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  applyCorsHeaders(req, res);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || undefined;

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    message = `A record with this ${field} already exists`;
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "id"}`;
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
  }

  if (statusCode >= 500) {
    console.error(`[Error] ${statusCode} - ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(process.env.NODE_ENV !== "production" && statusCode >= 500 && err.stack
      ? { stack: err.stack }
      : {}),
  });
};
