import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const POST = publicRoute(async () => {
  await clearSessionCookie();
  return NextResponse.json({ data: { loggedOut: true } });
});
