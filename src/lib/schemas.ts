import { z } from "zod";
import { normalizeVehicleNumber, validatePaymentState } from "./rules";

/** Empty strings from HTML forms become undefined so optional fields behave. */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const optionalNullable = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === "" ? null : v), schema.nullish());

const text = (max: number) => z.string().trim().min(1, "Required").max(max);
const phone = z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number");
const email = z.string().trim().toLowerCase().email("Enter a valid email").max(100);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const id = z.coerce.number().int().positive();
/** A payment cannot be recorded as made after today (one day of slack for time zones). */
const pastOrToday = dateOnly.refine((v) => new Date(`${v}T00:00:00.000Z`).getTime() <= Date.now() + 24 * 60 * 60 * 1000, "Payment date cannot be in the future");

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
  q: z.string().trim().max(100).optional(),
});

export const loginBody = z.object({
  identifier: z.string().trim().min(1, "Username or email is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

// ---- Apartments / residents / staff -------------------------------------------------------
export const apartmentBody = z.object({
  block: text(10).transform((v) => v.toUpperCase()),
  floorNo: z.coerce.number().int().min(0).max(200),
  flatNo: text(10),
  bhk: z.coerce.number().int().min(1).max(10),
});
export const apartmentPatch = apartmentBody.partial();

export const residentBody = z.object({
  apartmentId: id,
  name: text(100),
  phone: optionalNullable(phone),
  email: optionalNullable(email),
  residentType: z.enum(["OWNER", "TENANT"]),
});
export const residentPatch = residentBody.partial().extend({ isActive: z.boolean().optional() });

export const staffBody = z.object({
  name: text(100),
  role: text(50),
  phone: optionalNullable(phone),
  salary: optionalNullable(z.coerce.number().min(0).max(99999999.99)),
});
export const staffPatch = staffBody.partial().extend({ isActive: z.boolean().optional() });

// ---- Payments -----------------------------------------------------------------------------
export const billingMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const paymentBody = z
  .object({
    apartmentId: id,
    amount: z.coerce.number().positive().max(99999999.99),
    paymentMonth: billingMonth,
    status: z.enum(["PAID", "PENDING"]),
    paymentDate: optionalNullable(pastOrToday),
  })
  .superRefine((v, ctx) => {
    const problem = validatePaymentState(v);
    if (problem) ctx.addIssue({ code: "custom", path: ["paymentDate"], message: problem });
  });

export const paymentPatch = z.object({
  amount: z.coerce.number().positive().max(99999999.99).optional(),
  status: z.enum(["PAID", "PENDING"]).optional(),
  paymentDate: optionalNullable(pastOrToday),
});

export const paymentQuery = paginationQuery.extend({
  status: z.enum(["PAID", "PENDING"]).optional(),
  month: optional(billingMonth),
  apartmentId: optional(id),
});

// ---- Parking / vehicles -------------------------------------------------------------------
const vehicleType = z.enum(["CAR", "BIKE"]);

export const parkingBody = z.object({
  slotNumber: text(10).transform((v) => v.toUpperCase()),
  vehicleType,
  vehicleId: optional(id),
});

export const parkingPatch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allocate"), vehicleId: id }),
  z.object({ action: z.literal("release") }),
  z.object({ action: z.literal("update"), slotNumber: text(10).transform((v) => v.toUpperCase()).optional(), vehicleType: vehicleType.optional() }),
]);

export const parkingQuery = paginationQuery.extend({
  status: z.enum(["ALLOCATED", "AVAILABLE"]).optional(),
  vehicleType: vehicleType.optional(),
});

const vehicleNumber = z
  .string()
  .transform(normalizeVehicleNumber)
  .pipe(z.string().min(4, "Vehicle number is too short").max(20).regex(/^[A-Z0-9]+$/, "Letters and digits only"));

export const vehicleBody = z.object({
  residentId: optional(id),
  vehicleNumber,
  vehicleType,
  brand: optionalNullable(text(50)),
  parkingId: optional(id),
});

export const vehiclePatch = z.object({
  vehicleNumber: vehicleNumber.optional(),
  vehicleType: vehicleType.optional(),
  brand: optionalNullable(text(50)),
  parkingId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const vehicleQuery = paginationQuery.extend({
  active: z.enum(["true", "false"]).optional(),
  residentId: optional(id),
});

// ---- Complaints ---------------------------------------------------------------------------
export const complaintBody = z.object({
  category: text(50),
  description: text(255),
  residentId: optional(id), // honoured for ADMIN only; residents are always themselves
});

export const complaintPatch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), staffId: id, note: optional(text(500)) }),
  z.object({ action: z.literal("status"), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]), note: optional(text(500)) }),
]);

export const complaintNoteBody = z.object({ note: text(500) });

export const complaintQuery = paginationQuery.extend({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  category: optional(text(50)),
  staffId: optional(id),
});

// ---- Visitors / notices / feedback (MongoDB) ----------------------------------------------
export const visitorBody = z.object({
  visitorName: text(100),
  phone: optional(phone),
  purpose: text(200),
  apartmentId: id,
  hostResidentId: optional(id),
  vehicleNumber: optional(vehicleNumber),
});

export const visitorQuery = paginationQuery.extend({
  apartmentId: optional(id),
  status: z.enum(["INSIDE", "EXITED"]).optional(),
  from: optional(dateOnly),
  to: optional(dateOnly),
});

const audience = z.enum(["ALL", "OWNERS", "TENANTS", "MAINTENANCE", "SECURITY"]);
const futureOrNull = optionalNullable(z.coerce.date());

export const noticeBody = z.object({
  documentType: z.enum(["NOTICE", "ANNOUNCEMENT"]).default("NOTICE"),
  title: text(150),
  body: text(2000),
  category: text(50).default("General"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  audience: audience.default("ALL"),
  expiresAt: futureOrNull,
  publish: z.boolean().default(false),
});

export const noticePatch = z.object({
  title: text(150).optional(),
  body: text(2000).optional(),
  category: text(50).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  audience: audience.optional(),
  expiresAt: futureOrNull,
  action: z.enum(["publish", "archive"]).optional(),
});

export const noticeQuery = paginationQuery.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  audience: audience.optional(),
  from: optional(dateOnly),
  to: optional(dateOnly),
});

export const feedbackBody = z.object({
  residentId: optional(id), // which of the user's flats, when they have several
  category: text(50),
  rating: z.coerce.number().int().min(1).max(5),
  message: text(1000),
});

export const feedbackPatch = z.object({
  status: z.enum(["NEW", "REVIEWED", "RESOLVED"]),
  adminNote: optional(text(500)),
});

export const feedbackQuery = paginationQuery.extend({ status: z.enum(["NEW", "REVIEWED", "RESOLVED"]).optional() });

// ---- Accounts -----------------------------------------------------------------------------
export const accountBody = z
  .object({
    username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Letters, digits, . _ - only"),
    email,
    password: z.string().min(10, "At least 10 characters").max(100),
    role: z.enum(["ADMIN", "RESIDENT", "MAINTENANCE", "SECURITY"]),
    residentId: optional(id),
    staffId: optional(id),
  })
  .superRefine((v, ctx) => {
    if (v.role === "RESIDENT" && !v.residentId) ctx.addIssue({ code: "custom", path: ["residentId"], message: "Required for RESIDENT accounts" });
    if ((v.role === "MAINTENANCE" || v.role === "SECURITY") && !v.staffId) ctx.addIssue({ code: "custom", path: ["staffId"], message: "Required for staff accounts" });
    if (v.role === "ADMIN" && (v.residentId || v.staffId)) ctx.addIssue({ code: "custom", path: ["role"], message: "ADMIN accounts are standalone" });
  });

export const accountPatch = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(10, "At least 10 characters").max(100).optional(),
  linkResidentId: optional(id),
  unlinkResidentId: optional(id),
});

// ---- Account requests (public sign-up, admin approval) -------------------------------------
export const accountRequestBody = z.object({
  fullName: text(100),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Letters, digits, . _ - only"),
  email,
  password: z.string().min(10, "At least 10 characters").max(100),
  requestedRole: z.enum(["RESIDENT", "MAINTENANCE", "SECURITY"]),
  phone: optional(phone),
  flatInfo: optional(text(50)),
  message: optional(text(300)),
});

export const accountRequestQuery = paginationQuery.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const accountRequestPatch = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    role: z.enum(["RESIDENT", "MAINTENANCE", "SECURITY"]),
    residentId: optional(id),
    staffId: optional(id),
    note: optional(text(300)),
  }),
  z.object({ action: z.literal("reject"), note: optional(text(300)) }),
]);
