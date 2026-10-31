import type { CurrentUser } from "@/lib/auth";
import { forbidden } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { ComplaintActivity } from "@/models";

export const pageArgs = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
export const pageMeta = (q: { page: number; pageSize: number }, total: number) => ({
  page: q.page,
  pageSize: q.pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
});

/** Maintenance billing is the owner's concern: tenants of a flat never see its bills. */
export function assertBillingAccess(user: CurrentUser) {
  if (user.role === "RESIDENT" && user.residentType !== "OWNER") {
    throw forbidden("Maintenance bills are handled by the flat's owner");
  }
}

/** Residents may only touch their own apartment; admins may touch any. */
export function assertApartmentAccess(user: CurrentUser, apartmentId: number | null) {
  if (user.role === "ADMIN") return;
  if (user.role === "RESIDENT" && user.apartmentId !== null && user.apartmentId === apartmentId) return;
  throw forbidden();
}

export const toDateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const todayDateOnly = () => toDateOnly(new Date().toISOString().slice(0, 10));

export type ActivityInput = {
  complaintId: number;
  user: CurrentUser;
  action: "CREATED" | "ASSIGNED" | "STATUS_CHANGED" | "NOTE";
  oldStatus?: string;
  newStatus?: string;
  note?: string;
};

/**
 * Appends a complaint_activity document. Never throws: callers have already committed the MySQL
 * change and must report a partial failure instead of pretending both writes succeeded.
 */
export async function appendActivity(input: ActivityInput): Promise<{ ok: true } | { ok: false }> {
  try {
    await connectMongo();
    await ComplaintActivity.create({
      complaintId: input.complaintId,
      actorUserId: input.user.id,
      actorRole: input.user.role,
      actorName: input.user.displayName,
      action: input.action,
      oldStatus: input.oldStatus,
      newStatus: input.newStatus,
      note: input.note,
      createdAt: new Date(),
    });
    return { ok: true };
  } catch (err) {
    console.error("Mongo activity write failed:", err instanceof Error ? err.name : "unknown");
    return { ok: false };
  }
}

export const ACTIVITY_WARNING =
  "The change was saved in MySQL, but the activity history entry could not be written to MongoDB. The timeline may be missing this event.";
