import rateLimit from "express-rate-limit";

const keyGenerator = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = String(forwarded).split(",")[0].trim();
    if (ip) return ip;
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
};

// Rate limiting for general authentication attempts (login, registration)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  message: {
    success: false,
    message: "Too many requests. Please try again after 15 minutes.",
  },
});

// Stricter rate limiting specifically for OTP generation (prevent SMS/email spam)
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 10, // Limit each IP to 10 OTP requests per 5 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  message: {
    success: false,
    message: "Too many OTP requests. Please try again after 5 minutes.",
  },
});

// Strict rate limiting for account registration (prevent mass account creation)
export const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 registration attempts per 15 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again after 15 minutes.",
  },
});

// Moderate rate limiting for authenticated mutations (password/profile changes)
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // Limit each IP to 20 mutation requests per 15 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  message: {
    success: false,
    message: "Too many requests. Please try again after 15 minutes.",
  },
});

// Rate limiting for financial mutations (payments/expenses).
export const financeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 financial mutations per 15 minutes
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  message: {
    success: false,
    message: "Too many requests. Please try again after 15 minutes.",
  },
});
