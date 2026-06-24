import rateLimit from "express-rate-limit";

// Rate limiting for general authentication attempts (login, registration)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: "draft-7", // draft-7 combines standard headers into RateLimit
  legacyHeaders: false, // Disable X-RateLimit-* headers
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
  message: {
    success: false,
    message: "Too many OTP requests. Please try again after 5 minutes.",
  },
});
