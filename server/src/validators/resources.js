import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const floorSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    level: z.coerce.number().int().min(0).optional(),
  }).optional().default({}),
});

export const roomSchema = z.object({
  body: z.object({
    roomNumber: z.string().min(1),
    floorId: objectId.optional(),
    floor: z.coerce.number().int().min(0).default(1),
    capacity: z.coerce.number().int().min(1).max(20),
    monthlyRent: z.coerce.number().min(0).default(0),
    amenities: z.array(z.string()).optional(),
  }),
});

export const roomUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    monthlyRent: z.coerce.number().min(0).optional(),
    sharingType: z.coerce.number().int().min(1).max(20).optional(),
    type: z.enum(["AC", "Non-AC"]).optional(),
    amenities: z.array(z.string()).optional(),
  }),
});

export const bedUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["available", "occupied", "maintenance"]).optional(),
    bedLabel: z.string().optional(),
    monthlyRent: z.coerce.number().min(0).optional(),
  }),
});

export const tenantCreateSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(10),
    emergencyContact: z.string().optional(),
    // Enforce Hostel -> Floor -> Room -> Bed at creation time
    floorId: objectId,
    roomId: objectId,
    bedId: objectId,
    monthlyRent: z.coerce.number().min(0).optional(),
    joinDate: z.coerce.date().optional(),
  }),
});

export const tenantUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    emergencyContact: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const assignBedSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ bedId: objectId }),
});

export const complaintCreateSchema = z.object({
  body: z.object({
    title: z.string().min(2).default("Support request"),
    description: z.string().min(3, "Description must be at least 3 characters"),
    category: z.enum(["electrical", "cleaning", "water", "wifi", "food", "maintenance", "others"]),
    priority: z.enum(["low", "medium", "high", "emergency"]).default("medium"),
    imageUrl: z.string().optional(),
  }),
});

export const complaintUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["pending", "assigned", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high", "emergency"]).optional(),
    assignedTo: z.string().optional(),
    note: z.string().optional(),
  }),
});

export const paymentCreateSchema = z.object({
  body: z.object({
    tenantId: objectId,
    amount: z.coerce.number().min(0),
    fineAmount: z.coerce.number().min(0).default(0),
    month: z.string().min(1),
    year: z.coerce.number().int(),
    dueDate: z.coerce.date(),
    notes: z.string().optional(),
  }),
});

export const paymentUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["paid", "unpaid", "overdue", "partial"]).optional(),
    fineAmount: z.coerce.number().min(0).optional(),
    paidDate: z.coerce.date().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const noticeSchema = z.object({
  body: z.object({
    title: z.string().min(2),
    message: z.string().min(5),
    type: z.enum(["maintenance", "water_shutdown", "curfew", "fee_reminder", "emergency", "general"]).default("general"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    expiresAt: z.coerce.date().optional(),
  }),
});

export const bedShiftSchema = z.object({
  body: z.object({
    requestedRoomId: objectId.optional(),
    reason: z.string().min(5),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const hostelCreateSchema = z.object({
  body: z.object({
    hostelName: z.string().min(2),
    address: z.string().optional(),
    city: z.string().optional(),
    contactPhone: z.string().optional(),
    totalFloors: z.coerce.number().int().min(1).optional(),
  }),
});

const expenseCategories = [
  "electricity", "water", "maintenance", "cleaning",
  "food", "salary", "repairs", "internet",
  "security", "supplies", "furniture", "other"
];

export const createExpenseSchema = z.object({
  body: z.object({
    category: z.enum(expenseCategories),
    amount: z.coerce.number().min(1, "Amount must be > 0"),
    description: z.string().max(500).optional().default(""),
    date: z.string().optional(),
    paymentMethod: z.enum(["cash", "upi", "bank_transfer", "card", "other"]).optional().default("cash"),
    vendor: z.string().max(200).optional().default(""),
    isRecurring: z.boolean().optional().default(false),
  }),
});

export const updateExpenseSchema = z.object({
  body: z.object({
    category: z.enum(expenseCategories).optional(),
    amount: z.coerce.number().min(1).optional(),
    description: z.string().max(500).optional(),
    date: z.string().optional(),
    paymentMethod: z.enum(["cash", "upi", "bank_transfer", "card", "other"]).optional(),
    vendor: z.string().max(200).optional(),
    isRecurring: z.boolean().optional(),
  }),
});
