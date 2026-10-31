import { NextResponse } from "next/server";
import { ApiError, conflict, parseBody, publicRoute } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountRequestBody } from "@/lib/schemas";

// Public endpoint, so it is throttled in MySQL per client address: 5 requests per hour.
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;

export const POST = publicRoute(async (req) => {
  const body = await parseBody(req, accountRequestBody);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `request:${ip}`.slice(0, 100);
  const entry = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  const live = entry && entry.resetAt.getTime() > Date.now() ? entry : null;
  if (live && live.failures >= MAX_PER_WINDOW) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many requests from this address. Try again later.");
  }
  await prisma.loginAttempt.upsert({
    where: { identifier: key },
    create: { identifier: key, failures: 1, resetAt: new Date(Date.now() + WINDOW_MS) },
    update: live ? { failures: { increment: 1 } } : { failures: 1, resetAt: new Date(Date.now() + WINDOW_MS) },
  });

  const [account, pending] = await Promise.all([
    prisma.userAccount.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] }, select: { id: true } }),
    prisma.accountRequest.findFirst({ where: { status: "PENDING", OR: [{ username: body.username }, { email: body.email }] }, select: { id: true } }),
  ]);
  if (account) {
    throw conflict("That username or email already has an account. If you need another flat added to it, ask the administrator to link it.");
  }
  if (pending) throw conflict("A request with that username or email is already awaiting approval");

  const { password, ...rest } = body;
  await prisma.accountRequest.create({ data: { ...rest, passwordHash: await hashPassword(password) } });

  return NextResponse.json(
    { data: { submitted: true, message: "Request received. An administrator will review it; you can sign in once it is approved." } },
    { status: 201 },
  );
});
