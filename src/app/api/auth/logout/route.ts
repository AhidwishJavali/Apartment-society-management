import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api";
import { clearSessionCookie, revokeSessions } from "@/lib/auth";

export const POST = publicRoute(async () => {
  await revokeSessions();
  await clearSessionCookie();
  return NextResponse.json({ data: { loggedOut: true } });
});
