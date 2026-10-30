import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./session-token";
import type { Role } from "./rules";

export type CurrentUser = {
  id: number;
  username: string;
  role: Role;
  residentId: number | null;
  staffId: number | null;
  apartmentId: number | null;
  residentType: "OWNER" | "TENANT" | null;
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
    include: { resident: true, staff: true },
  });
  if (!account || !account.isActive) return null;
  if (account.sessionsValidAfter && session.issuedAtMs <= account.sessionsValidAfter.getTime()) return null;
  if (account.resident && !account.resident.isActive) return null;
  if (account.staff && !account.staff.isActive) return null;

  return {
    id: account.id,
    username: account.username,
    role: account.role,
    residentId: account.residentId,
    staffId: account.staffId,
    apartmentId: account.resident?.apartmentId ?? null,
    residentType: account.resident?.residentType ?? null,
    displayName: account.resident?.name ?? account.staff?.name ?? account.username,
  };
}
