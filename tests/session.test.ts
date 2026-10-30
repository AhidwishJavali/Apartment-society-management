import { beforeAll, describe, expect, it } from "vitest";
import { getEnv } from "@/lib/env";
import { signSession, verifySession } from "@/lib/session-token";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-that-is-definitely-long-enough-123";
});

describe("session tokens", () => {
  it("round-trips the user id and role", async () => {
    const token = await signSession(7, "SECURITY");
    expect(await verifySession(token)).toMatchObject({ sub: "7", role: "SECURITY" });
  });

  it("rejects missing, garbage and tampered tokens", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
    const token = await signSession(1, "RESIDENT");
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "1", role: "ADMIN", exp: 9999999999 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await signSession(1, "ADMIN");
    process.env.SESSION_SECRET = "another-secret-that-is-also-long-enough-456";
    expect(await verifySession(token)).toBeNull();
  });
});

describe("environment validation", () => {
  it("reports every invalid variable", () => {
    delete process.env.DATABASE_URL;
    process.env.MONGODB_URI = "http://wrong";
    process.env.SESSION_SECRET = "short";
    expect(() => getEnv()).toThrow(/DATABASE_URL[\s\S]*MONGODB_URI[\s\S]*SESSION_SECRET/);
  });
});
