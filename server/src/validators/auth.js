import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional(),
    hostelName: z.string().min(2),
    address: z.string().optional(),
    city: z.string().optional(),
  }),
});

export const ownerSendOtpSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().min(10),
    hostelName: z.string().min(2),
    address: z.string().optional(),
    city: z.string().optional(),
  }),
});

export const ownerVerifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export const sendOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10),
    otp: z.string().length(6),
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
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  }),
});

export const switchHostelSchema = z.object({
  body: z.object({
    hostelId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id"),
  }),
});
