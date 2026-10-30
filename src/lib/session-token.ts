import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./rules";

export const SESSION_COOKIE = "society_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type SessionPayload = { sub: string; role: Role };

// Edge-safe (used by middleware), so it reads process.env directly instead of getEnv().
function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set and at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: number, role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}
