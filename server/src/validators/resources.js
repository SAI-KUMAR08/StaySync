import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/**
 * Document-upload field: accepts a base64 data URL of a photo (JPG/PNG/WebP) or
 * PDF (produced by the client's FileReader), or an http(s) URL. The base64
 * length is bounded so a stored value stays reasonable.
 */
const ALLOWED_DOC_MIME =
  /^data:(image\/(jpeg|png|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,/i;
const MAX_DOC_BASE64_LENGTH = 8 * 1024 * 1024; // ≈ 6 MB binary

function validateDocUrl(val, ctx) {
  if (val === undefined || val === "") return;
  const isUrl = /^https?:\/\//i.test(val);
  const isDataUrl = ALLOWED_DOC_MIME.test(val);
  if (!isUrl && !isDataUrl) {
    ctx.addIssue({
      code: "custom",
      message: "Document must be a photo (JPG/PNG/WebP), PDF, DOCX, or a valid URL",
    });
    return;
  }
  if (isDataUrl && val.length > MAX_DOC_BASE64_LENGTH) {
    ctx.addIssue({ code: "custom", message: "Document is too large (max ~6 MB)" });
  }
}

const docField = z.string().optional().superRefine(validateDocUrl);

// Required variant — same rules but the value must be present (used inside array items)
const docFieldRequired = z.string().min(1, "Document URL is required").superRefine(validateDocUrl);

export const floorSchema = z.object({
  body: z
    .object({
      floorName: z.string().min(1).optional(),
      floorNumber: z.coerce.number().int().min(0).optional(),
      name: z.string().min(1).optional(), // alias — legacy support
      level: z.coerce.number().int().min(0).optional(), // alias — legacy support
    })
    .optional()
    .default({}),
});

export const roomSchema = z.object({
  body: z.object({
    roomNumber: z.string().min(1),
    floorId: objectId.optional(),
    floor: z.coerce.number().int().min(0).default(1),
    capacity: z.coerce.number().int().min(1).max(20),
    pricing: z.coerce.number().min(0).default(0),
    monthlyRent: z.coerce.number().min(0).default(0).optional(), // alias
    amenities: z.array(z.string()).optional(),
  }),
});

export const roomUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    pricing: z.coerce.number().min(0).optional(),
    monthlyRent: z.coerce.number().min(0).optional(), // alias
    sharingType: z.coerce.number().int().min(1).max(20).optional(),
    type: z.enum(["AC", "Non-AC"]).optional(),
    amenities: z.array(z.string()).optional(),
  }),
});

export const bedUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["available", "occupied", "maintenance"]).optional(),
    bedNumber: z.string().optional(),
    bedLabel: z.string().optional(), // alias
    pricing: z.coerce.number().min(0).optional(),
    monthlyRent: z.coerce.number().min(0).optional(), // alias
  }),
});

const contactMismatch = {
  path: ["emergencyContact"],
  message: "Emergency Contact Number must be different from the Mobile Number.",
};

export const tenantCreateSchema = z.object({
  body: z
    .object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email").optional().or(z.literal("")),
      phone: z.string().min(10, "Phone must be at least 10 digits"),
      aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar Number must be exactly 12 digits"),
      address: z.string().min(1, "Address is required").trim(),
      emergencyContact: z.string().regex(/^\d{10}$/, "Emergency Contact must be exactly 10 digits"),
      sharingType: z.coerce.number().int().min(1).max(20), // the room type the admin selects
      floorId: objectId.optional(),
      roomId: objectId.optional(),
      bedId: objectId.optional(), // kept for backward compatibility — beds are auto-assigned
      monthlyRent: z.coerce.number().min(0).optional(),
      joinDate: z.coerce.date().optional(),
      idProof: docField,
      isTemporary: z.boolean().optional(),
      isSecurityDepositPaid: z.boolean().optional(),
      securityDepositDate: z.coerce.date().optional(),
      preferredSharing: z.preprocess(
        (val) => (val === null || val === undefined ? undefined : val),
        z.coerce.number().int().min(1).max(20).optional()
      ),
    })
    .refine(
      (d) => !d.phone || !d.emergencyContact || d.phone !== d.emergencyContact,
      contactMismatch
    ),
});

export const tenantUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      email: z.string().email("Invalid email").optional(),
      emergencyContact: z
        .string()
        .regex(/^\d{10}$/, "Emergency Contact must be exactly 10 digits")
        .optional(),
      monthlyRent: z.coerce.number().min(0).optional(),
      aadhaarNumber: z
        .string()
        .regex(/^\d{12}$/, "Aadhaar Number must be exactly 12 digits")
        .optional(),
      address: z.string().min(1, "Address is required").trim().optional(),
      idProof: docField,
      offlineBookingForm: docField,
      isSecurityDepositPaid: z.boolean().optional(),
      securityDepositDate: z.coerce.date().optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (d) => !d.phone || !d.emergencyContact || d.phone !== d.emergencyContact,
      contactMismatch
    ),
});

export const assignBedSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      sharingType: z.coerce.number().int().min(1).max(20).optional(), // auto-assign an available room+bed of this type
      roomId: objectId.optional(), // auto-assign an available bed in this room
      bedId: objectId.optional(), // explicit bed (backward compatibility)
      isTemporary: z.boolean().optional(),
      idProof: docField,
      preferredSharing: z.preprocess(
        (val) => (val === null || val === undefined ? undefined : val),
        z.coerce.number().int().min(1).max(20).optional()
      ),
    })
    .refine((d) => d.sharingType || d.roomId || d.bedId, {
      path: ["sharingType"],
      message: "Select a room type to assign",
    }),
});

export const complaintCreateSchema = z.object({
  body: z.object({
    title: z.string().min(2).default("Support request"),
    description: z.string().min(3, "Description must be at least 3 characters"),
    category: z.enum(["electrical", "cleaning", "water", "wifi", "food", "maintenance", "others"]),
    priority: z.enum(["low", "medium", "high", "emergency"]).default("medium"),
    imageUrl: z.string().url("Image must be a valid URL").optional().or(z.literal("")),
  }),
});

export const complaintUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z
      .enum(["pending", "assigned", "in_progress", "resolved", "closed", "needs_info"])
      .optional(),
    priority: z.enum(["low", "medium", "high", "emergency"]).optional(),
    assignedTo: z.string().optional(),
    note: z.string().trim().max(1000).optional(),
  }),
});

export const paymentCreateSchema = z.object({
  body: z.object({
    tenantId: objectId,
    amount: z.coerce.number().min(0),
    fineAmount: z.coerce.number().min(0).default(0),
    paymentMonth: z.enum([
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]),
    month: z
      .enum([
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ])
      .optional(), // alias
    year: z.coerce.number().int(),
    dueDate: z.coerce.date(),
    notes: z.string().optional(),
  }),
});

export const paymentUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    paymentStatus: z.enum(["paid", "unpaid", "overdue", "partial"]).optional(),
    status: z.enum(["paid", "unpaid", "overdue", "partial"]).optional(), // alias
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
    type: z
      .enum(["maintenance", "water_shutdown", "curfew", "fee_reminder", "emergency", "general"])
      .default("general"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    expiresAt: z.coerce.date().optional(),
  }),
});

export const bedShiftSchema = z.object({
  body: z.object({
    // Required — a shift request without a target room can never be approved.
    requestedRoomId: objectId,
    reason: z.string().min(5, "Reason must be at least 5 characters"),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const hostelUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      contactPhone: z.string().optional(),
    })
    .strict(),
});

export const bedShiftUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
    ownerNote: z.string().optional(),
  }),
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
  "electricity",
  "water",
  "maintenance",
  "cleaning",
  "food",
  "salary",
  "repairs",
  "internet",
  "security",
  "supplies",
  "furniture",
  "other",
];

export const createExpenseSchema = z.object({
  body: z.object({
    category: z.enum(expenseCategories),
    amount: z.coerce.number().min(1, "Amount must be > 0"),
    description: z.string().max(500).optional().default(""),
    date: z.string().optional(),
    paymentMethod: z
      .enum(["cash", "upi", "bank_transfer", "card", "other"])
      .optional()
      .default("cash"),
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

const mealTypes = ["breakfast", "lunch", "snacks", "dinner"];

// Accept both 24h ("07:30") and 12h ("07:30 AM") formats; reject garbage like "99:99 XM".
const timeFormat = z
  .string()
  .regex(
    /^(0?[0-9]|1[0-9]|2[0-3]):[0-5]\d(\s?(AM|PM))?$/i,
    "Invalid time — use HH:MM or HH:MM AM/PM"
  );
const mealItems = z.array(z.string().trim().min(1).max(40)).max(40).optional();

export const mealTimingSchema = z.object({
  body: z.object({
    mealType: z.enum(mealTypes),
    name: z.string().min(1).optional(),
    items: mealItems,
    startTime: timeFormat.optional(),
    endTime: timeFormat.optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional(),
  }),
});

export const mealTimingUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    mealType: z.enum(mealTypes).optional(),
    name: z.string().min(1).optional(),
    items: mealItems,
    startTime: timeFormat.optional(),
    endTime: timeFormat.optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const paymentRequestSchema = z.object({
  body: z.object({
    paymentMonth: z.enum([
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]),
    year: z.coerce.number().int(),
    // A payment request must be for a positive, sane amount.
    amount: z.coerce
      .number()
      .min(1, "Amount must be greater than 0")
      .max(500000, "Amount is too large"),
    paymentProof: z.string().url("Payment proof must be a valid URL").optional().or(z.literal("")),
    notes: z.string().max(500).optional(),
  }),
});

export const paymentRequestReviewSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
    reviewNotes: z.string().optional(),
  }),
});

export const createVacateRequestSchema = z.object({
  body: z.object({
    requestedVacateDate: z.string().refine((date) => !isNaN(Date.parse(date)), "Invalid date"),
    reason: z.string().optional(),
  }),
});

export const reviewVacateRequestSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
    reviewNotes: z.string().optional(),
  }),
});

/**
 * Tenant-initiated profile change. At least one field must be provided; values
 * are validated against the same rules used at tenant creation.
 */
export const profileRequestSchema = z.object({
  body: z
    .object({
      name: z.string().min(2, "Name must be at least 2 characters").trim().optional(),
      phone: z
        .string()
        .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits")
        .optional(),
      email: z.string().email("Invalid email").optional(),
      address: z.string().min(1, "Address is required").trim().optional(),
      emergencyContact: z
        .string()
        .regex(/^\d{10}$/, "Emergency Contact must be exactly 10 digits")
        .optional(),
      aadhaarNumber: z
        .string()
        .regex(/^\d{12}$/, "Aadhaar Number must be exactly 12 digits")
        .optional(),
      // Supporting documents: photos (JPG/PNG/WebP), PDFs, or DOCX files
      documents: z
        .array(
          z.object({
            name: z.string().min(1, "Document name is required"),
            url: docFieldRequired,
          })
        )
        .max(3, "You can attach at most 3 documents")
        .optional(),
    })
    .refine(
      (d) =>
        [d.name, d.phone, d.email, d.address, d.emergencyContact, d.aadhaarNumber].some(
          (v) => v !== undefined
        ) ||
        (Array.isArray(d.documents) && d.documents.length > 0),
      { message: "Provide at least one field or document to update" }
    )
    .refine(
      (d) => !d.phone || !d.emergencyContact || d.phone !== d.emergencyContact,
      contactMismatch
    ),
});

export const profileRequestReviewSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
    reviewNotes: z.string().trim().max(1000).optional(),
  }),
});

export const setupHostelSchema = z.object({
  body: z.object({
    floors: z
      .array(
        z.object({
          number: z.coerce.number().int().min(0),
          rooms: z
            .array(
              z.object({
                number: z.coerce.number().int().min(1),
                sharingType: z.coerce.number().int().min(1).max(20),
                price: z.coerce.number().min(0),
                isAC: z.boolean().optional(),
              })
            )
            .default([]),
        })
      )
      .min(1, "At least one floor is required"),
  }),
});
