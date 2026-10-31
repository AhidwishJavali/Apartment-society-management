import type { Prisma } from "@prisma/client";
import type { CurrentUser, Residency } from "@/lib/auth";
import { badRequest, forbidden } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { ComplaintActivity } from "@/models";

export const pageArgs = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
export const pageMeta = (q: { page: number; pageSize: number }, total: number) => ({
  page: q.page,
  pageSize: q.pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
});

/** Maintenance billing is the owner's concern: someone who only rents never sees bills. */
export function assertBillingAccess(user: CurrentUser) {
  if (user.role === "RESIDENT" && user.ownedApartmentIds.length === 0) {
    throw forbidden("Maintenance bills are handled by the flat's owner");
  }
}

/** Flats whose bills this user may see (undefined = all, for admins). */
export function billableApartments(user: CurrentUser): number[] | undefined {
  return user.role === "ADMIN" ? undefined : user.ownedApartmentIds;
}

/** Residents may only touch flats they live in or own; admins may touch any. */
export function assertApartmentAccess(user: CurrentUser, apartmentId: number | null) {
  if (user.role === "ADMIN") return;
  if (user.role === "RESIDENT" && apartmentId !== null && user.apartmentIds.includes(apartmentId)) return;
  throw forbidden();
}

/** Residents visible to this user: their own residency rows, plus everyone in flats they own. */
export function visibleResidentsWhere(user: CurrentUser): Prisma.ResidentWhereInput {
  return { OR: [{ id: { in: user.residentIds } }, { apartmentId: { in: user.ownedApartmentIds } }] };
}

/**
 * Picks which of the user's residencies an action (complaint, feedback) is filed under. With one
 * flat it is implicit; with several the client must say which, and it must be one of theirs.
 */
export function pickResidency(user: CurrentUser, residentId: number | undefined): Residency {
  if (residentId !== undefined) {
    const match = user.residencies.find((r) => r.residentId === residentId);
    if (!match) throw forbidden("That flat is not one of yours");
    return match;
  }
  if (user.residencies.length === 1) return user.residencies[0];
  if (user.residencies.length === 0) throw badRequest("Your account is not linked to a flat");
  throw badRequest("You have more than one flat: choose which one this is for", { fieldErrors: { residentId: ["Choose a flat"] } });
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
