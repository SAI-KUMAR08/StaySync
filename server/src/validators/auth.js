import { z } from "zod";

// ── Password strength rules ──────────────────────────────
const passwordMinLength = 8;
const passwordMessage = `Password must be at least ${passwordMinLength} characters with at least one uppercase letter, one lowercase letter, and one number`;

const strongPassword = z
  .string()
  .min(passwordMinLength, passwordMessage)
  .regex(/[a-z]/, passwordMessage)
  .regex(/[A-Z]/, passwordMessage)
  .regex(/[0-9]/, passwordMessage);

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: strongPassword,
    phone: z.string().optional(),
    hostelName: z.string().min(2, "Hostel name must be at least 2 characters"),
    address: z.string().optional(),
    city: z.string().optional(),
  }),
});

export const ownerSendOtpSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: strongPassword,
    phone: z.string().min(10, "Phone must be at least 10 digits"),
    hostelName: z.string().min(2, "Hostel name must be at least 2 characters"),
    address: z.string().optional(),
    city: z.string().optional(),
  }),
});

export const ownerVerifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const sendOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone must be at least 10 digits"),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone must be at least 10 digits"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1).optional(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPassword,
  }),
});

export const switchHostelSchema = z.object({
  body: z.object({
    hostelId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id"),
  }),
});

export const tenantLoginSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const tenantSetPasswordSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
    otp: z.string().length(6, "OTP must be exactly 6 digits").optional(),
    password: strongPassword,
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
    newPassword: strongPassword,
  }),
});

export const tenantCheckSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
  }),
});
