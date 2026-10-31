import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./session-token";
import type { Role } from "./rules";

export type Residency = { residentId: number; apartmentId: number; residentType: "OWNER" | "TENANT"; label: string };

export type CurrentUser = {
  id: number;
  username: string;
  role: Role;
  staffId: number | null;
  /** Active residencies (one per flat). A person may own some flats and rent others. */
  residencies: Residency[];
  residentIds: number[];
  /** Every flat the user lives in or owns. */
  apartmentIds: number[];
  /** Flats where the user is an OWNER: billing and household access. */
  ownedApartmentIds: number[];
  isOwner: boolean;
  isTenant: boolean;
  displayName: string;
};

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export async function setSessionCookie(userId: number, role: Role): Promise<void> {
  const token = await signSession(userId, role);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Server-side logout: tokens issued up to now stop working even if someone kept a copy. */
export async function revokeSessions(): Promise<void> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const userId = Number(session?.sub);
  if (Number.isInteger(userId)) {
    await prisma.userAccount.updateMany({ where: { id: userId }, data: { sessionsValidAfter: new Date() } });
  }
}

/**
 * Resolves the signed-in user from the session cookie and re-reads the account from MySQL, so a
 * deactivated account or changed role takes effect immediately instead of when the token expires.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const userId = Number(session.sub);
  if (!Number.isInteger(userId)) return null;

  const account = await prisma.userAccount.findUnique({
    where: { id: userId },
    include: {
      staff: true,
      residencies: {
        where: { isActive: true },
        orderBy: { id: "asc" },
        include: { apartment: { select: { block: true, flatNo: true } } },
      },
    },
  });
  if (!account || !account.isActive) return null;
  if (account.sessionsValidAfter && session.issuedAtMs <= account.sessionsValidAfter.getTime()) return null;
  // A resident who no longer lives in or owns any flat cannot use the app.
  if (account.role === "RESIDENT" && account.residencies.length === 0) return null;
  if (account.staff && !account.staff.isActive) return null;

  const residencies: Residency[] = account.residencies.map((r) => ({
    residentId: r.id,
    apartmentId: r.apartmentId,
    residentType: r.residentType,
    label: `${r.apartment.block}-${r.apartment.flatNo}`,
  }));
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    staffId: account.staffId,
    residencies,
    residentIds: residencies.map((r) => r.residentId),
    apartmentIds: [...new Set(residencies.map((r) => r.apartmentId))],
    ownedApartmentIds: [...new Set(residencies.filter((r) => r.residentType === "OWNER").map((r) => r.apartmentId))],
    isOwner: residencies.some((r) => r.residentType === "OWNER"),
    isTenant: residencies.some((r) => r.residentType === "TENANT"),
    displayName: account.residencies[0]?.name ?? account.staff?.name ?? account.username,
  };
}
