import type { Prisma } from "@prisma/client";
import { ApiError, badRequest, notFound } from "@/lib/api";
import type { Role } from "@/lib/rules";

type Db = Prisma.TransactionClient;

const conflict = (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details);

/** Links a residency (one flat) to a login; the unique (account_id, apartment_id) index stops a second row for the same flat. */
export async function linkResidency(db: Db, accountId: number, residentId: number) {
  const resident = await db.resident.findUniqueOrThrow({ where: { id: residentId } });
  const sameFlat = await db.resident.findFirst({ where: { accountId, apartmentId: resident.apartmentId, NOT: { id: residentId } } });
  if (sameFlat) throw conflict("This login is already linked to someone in that flat");
  await db.resident.update({ where: { id: residentId }, data: { accountId } });
}

/** Shared by direct account creation and request approval: the linked record must exist and fit the role. */
export async function assertLinkable(db: Db, role: Role, residentId?: number | null, staffId?: number | null, accountId?: number) {
  if (role === "RESIDENT" && !residentId) throw badRequest("Choose the resident this account belongs to", { fieldErrors: { residentId: ["Required"] } });
  if ((role === "MAINTENANCE" || role === "SECURITY") && !staffId) throw badRequest("Choose the staff member this account belongs to", { fieldErrors: { staffId: ["Required"] } });
  if (role === "ADMIN" && (residentId || staffId)) throw badRequest("ADMIN accounts are standalone");
  if (role === "RESIDENT" && staffId) throw badRequest("A resident account cannot link to staff");
  if (role !== "RESIDENT" && residentId) throw badRequest("Only RESIDENT accounts link to a resident");

  if (residentId) {
    const resident = await db.resident.findUnique({ where: { id: residentId } });
    if (!resident || !resident.isActive) throw notFound("Active resident");
    if (resident.accountId !== null && resident.accountId !== accountId) {
      throw conflict("That resident is already linked to another login", { fieldErrors: { residentId: ["Already linked"] } });
    }
  }
  if (staffId) {
    const staff = await db.staff.findUnique({ where: { id: staffId } });
    if (!staff || !staff.isActive) throw notFound("Active staff member");
    if (role === "SECURITY" && !/security/i.test(staff.role)) {
      throw badRequest("SECURITY accounts must link to a staff member whose role is Security", { fieldErrors: { staffId: ["Not a security role"] } });
    }
  }
}

// passwordHash is never selected.
export const requestSelect = {
  id: true, fullName: true, username: true, email: true, requestedRole: true, phone: true, flatInfo: true,
  message: true, status: true, reviewedAt: true, reviewNote: true, createdAt: true,
} as const;

