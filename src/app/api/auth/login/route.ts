import { NextResponse } from "next/server";
import { ApiError, parseBody, publicRoute } from "@/lib/api";
import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginBody } from "@/lib/schemas";

// Failed attempts are counted in MySQL so the limit holds across processes and restarts.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

let dummyHash: Promise<string> | undefined;

export const POST = publicRoute(async (req) => {
  const { identifier, password } = await parseBody(req, loginBody);
  const key = identifier.toLowerCase().slice(0, 100);

  const entry = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  if (entry && entry.resetAt.getTime() > Date.now() && entry.failures >= MAX_FAILURES) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Try again in a few minutes.");
  }

  const account = await prisma.userAccount.findFirst({
    where: { OR: [{ username: identifier }, { email: key }] },
    include: { resident: true, staff: true },
  });

  // Always run one bcrypt comparison so timing does not reveal whether the account exists.
  dummyHash ??= hashPassword("not-a-real-password");
  const valid = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
  const usable = account && account.isActive && (account.resident?.isActive ?? true) && (account.staff?.isActive ?? true);

  if (!account || !valid || !usable) {
    const live = entry && entry.resetAt.getTime() > Date.now() ? entry : null;
    await prisma.loginAttempt.upsert({
      where: { identifier: key },
      create: { identifier: key, failures: 1, resetAt: new Date(Date.now() + WINDOW_MS) },
      update: live ? { failures: { increment: 1 } } : { failures: 1, resetAt: new Date(Date.now() + WINDOW_MS) },
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username/email or password");
  }

  await prisma.loginAttempt.deleteMany({ where: { identifier: key } });
  await prisma.userAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await setSessionCookie(account.id, account.role);

  return NextResponse.json({
    data: { id: account.id, username: account.username, role: account.role },
  });
});
