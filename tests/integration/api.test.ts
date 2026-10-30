// Runs the real route handlers against live MySQL + MongoDB: `npm run test:integration`.
// Skipped in a plain `npm test`. Every row it creates is removed again afterwards.
import "../../scripts/load-env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "society_session" && jar.token ? { name, value: jar.token } : undefined),
    set: (_n: string, value: string) => void (jar.token = value),
    delete: () => void (jar.token = undefined),
  }),
}));

const enabled = Boolean(process.env.RUN_INTEGRATION);
const d = describe.skipIf(!enabled);

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, method: string, url: string, body?: unknown, params: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", host: "localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json()) as any };
}

d("API against live databases", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let signSession: typeof import("@/lib/session-token").signSession;
  let mongoose: typeof import("mongoose").default;
  const tag = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 9);
  const ids = { apartments: [] as number[], residents: [] as number[], vehicles: [] as number[], slots: [] as number[], complaints: [] as number[] };
  const visitorIds: string[] = [];
  let apt: number, residentUserId: number, adminId: number, maintId: number, securityId: number, staffId: number, otherResident: number;

  const as = async (userId: number, role: "ADMIN" | "RESIDENT" | "MAINTENANCE" | "SECURITY") => void (jar.token = await signSession(userId, role));

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ signSession } = await import("@/lib/session-token"));
    mongoose = (await import("mongoose")).default;
    const users = await prisma.userAccount.findMany({ include: { staff: true } });
    const by = (u: string) => users.find((x) => x.username === u)!;
    adminId = by("admin").id;
    residentUserId = by("resident").id;
    maintId = by("maintenance").id;
    securityId = by("security").id;
    staffId = by("maintenance").staffId!;

    const a = await prisma.apartment.create({ data: { block: tag, floorNo: 1, flatNo: "1", bhk: 2 } });
    apt = a.id;
    ids.apartments.push(a.id);
    const r = await prisma.resident.create({ data: { apartmentId: a.id, name: `${tag} Host`, residentType: "OWNER" } });
    otherResident = r.id;
    ids.residents.push(r.id);
  });

  afterAll(async () => {
    if (!enabled) return;
    const { connectMongo } = await import("@/lib/mongodb");
    const { Visitor, ComplaintActivity } = await import("@/models");
    await connectMongo();
    await Visitor.deleteMany({ $or: [{ _id: { $in: visitorIds } }, { visitorName: { $regex: `^${tag}` } }] });
    await ComplaintActivity.deleteMany({ complaintId: { $in: ids.complaints } });
    await prisma.complaint.deleteMany({ where: { id: { in: ids.complaints } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: ids.vehicles } } });
    await prisma.parkingSpace.deleteMany({ where: { id: { in: ids.slots } } });
    await prisma.maintenancePayment.deleteMany({ where: { apartmentId: { in: ids.apartments } } });
    await prisma.resident.deleteMany({ where: { id: { in: ids.residents } } });
    await prisma.apartment.deleteMany({ where: { id: { in: ids.apartments } } });
    await prisma.$disconnect();
    await mongoose.disconnect();
  });

  it("rejects unauthenticated requests with 401", async () => {
    jar.token = undefined;
    const { GET } = await import("@/app/api/payments/route");
    expect((await call(GET as Handler, "GET", "/api/payments")).status).toBe(401);
  });

  it("rejects a duplicate monthly bill with 409", async () => {
    await as(adminId, "ADMIN");
    const { POST } = await import("@/app/api/payments/route");
    const bill = { apartmentId: apt, amount: 2500, paymentMonth: "2031-01", status: "PENDING" };
    expect((await call(POST as Handler, "POST", "/api/payments", bill)).status).toBe(201);
    const dup = await call(POST as Handler, "POST", "/api/payments", bill);
    expect(dup.status).toBe(409);
    expect(await prisma.maintenancePayment.count({ where: { apartmentId: apt } })).toBe(1);
  });

  it("validates payment state (PAID needs a date)", async () => {
    await as(adminId, "ADMIN");
    const { POST } = await import("@/app/api/payments/route");
    const res = await call(POST as Handler, "POST", "/api/payments", { apartmentId: apt, amount: 10, paymentMonth: "2031-02", status: "PAID" });
    expect(res.status).toBe(400);
  });

  it("denies payments to security (403) and scopes residents to their own flat", async () => {
    const { GET } = await import("@/app/api/payments/route");
    await as(securityId, "SECURITY");
    expect((await call(GET as Handler, "GET", "/api/payments")).status).toBe(403);

    await as(residentUserId, "RESIDENT");
    const own = await prisma.userAccount.findUniqueOrThrow({ where: { id: residentUserId }, include: { resident: true } });
    const res = await call(GET as Handler, "GET", `/api/payments?apartmentId=${apt}&pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.json.data.every((p: { apartmentId: number }) => p.apartmentId === own.resident!.apartmentId)).toBe(true);
    expect(res.json.data.some((p: { apartmentId: number }) => p.apartmentId === apt)).toBe(false);
  });

  describe("parking", () => {
    it("blocks incompatible type and double allocation, and keeps both sides consistent", async () => {
      await as(adminId, "ADMIN");
      const parking = await import("@/app/api/parking/route");
      const parkingId = await import("@/app/api/parking/[id]/route");

      const car = await call(parking.POST as Handler, "POST", "/api/parking", { slotNumber: `${tag}C`, vehicleType: "CAR" });
      expect(car.status).toBe(201);
      ids.slots.push(car.json.data.id);

      const [bike, car1, car2] = await Promise.all(
        [["BIKE", "B"], ["CAR", "1"], ["CAR", "2"]].map(([type, s]) =>
          prisma.vehicle.create({ data: { residentId: otherResident, vehicleNumber: `${tag}${s}`, vehicleType: type as "BIKE" | "CAR" } }),
        ),
      );
      ids.vehicles.push(bike.id, car1.id, car2.id);

      const slot = String(car.json.data.id);
      const patch = (vehicleId: number) => call(parkingId.PATCH as Handler, "PATCH", `/api/parking/${slot}`, { action: "allocate", vehicleId }, { id: slot });

      expect((await patch(bike.id)).status).toBe(400); // bike into car slot
      expect((await patch(car1.id)).status).toBe(200);
      expect((await patch(car2.id)).status).toBe(409); // already allocated

      const held = await prisma.vehicle.findUniqueOrThrow({ where: { id: car1.id } });
      expect(held.parkingId).toBe(car.json.data.id);

      expect((await call(parkingId.DELETE as Handler, "DELETE", `/api/parking/${slot}`, undefined, { id: slot })).status).toBe(409);
      const rel = await call(parkingId.PATCH as Handler, "PATCH", `/api/parking/${slot}`, { action: "release" }, { id: slot });
      expect(rel.json.data.status).toBe("AVAILABLE");
      expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: car1.id } })).parkingId).toBeNull();
    });

    it("lets only one of two concurrent allocations win", async () => {
      await as(adminId, "ADMIN");
      const parkingId = await import("@/app/api/parking/[id]/route");
      const slotRow = await prisma.parkingSpace.create({ data: { slotNumber: `${tag}R`, vehicleType: "CAR" } });
      ids.slots.push(slotRow.id);
      const vs = await Promise.all(
        ["X", "Y"].map((s) => prisma.vehicle.create({ data: { residentId: otherResident, vehicleNumber: `${tag}${s}`, vehicleType: "CAR" } })),
      );
      ids.vehicles.push(...vs.map((v) => v.id));
      const id = String(slotRow.id);
      const results = await Promise.all(
        vs.map((v) => call(parkingId.PATCH as Handler, "PATCH", `/api/parking/${id}`, { action: "allocate", vehicleId: v.id }, { id })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  it("runs the complaint lifecycle with a MongoDB timeline and role checks", async () => {
    const complaints = await import("@/app/api/complaints/route");
    const one = await import("@/app/api/complaints/[id]/route");

    await as(residentUserId, "RESIDENT");
    const filed = await call(complaints.POST as Handler, "POST", "/api/complaints", { category: "Plumbing", description: `${tag} leaking tap in kitchen` });
    expect(filed.status).toBe(201);
    const id = String(filed.json.data.id);
    ids.complaints.push(filed.json.data.id);
    const p = { id };

    // Residents cannot assign or change status.
    expect((await call(one.PATCH as Handler, "PATCH", `/api/complaints/${id}`, { action: "assign", staffId }, p)).status).toBe(403);

    // Status change before assignment is refused.
    await as(adminId, "ADMIN");
    expect((await call(one.PATCH as Handler, "PATCH", `/api/complaints/${id}`, { action: "status", status: "RESOLVED" }, p)).status).toBe(400);

    // Maintenance cannot see a complaint that is not assigned to them.
    await as(maintId, "MAINTENANCE");
    expect((await call(one.GET as Handler, "GET", `/api/complaints/${id}`, undefined, p)).status).toBe(403);

    await as(adminId, "ADMIN");
    const assigned = await call(one.PATCH as Handler, "PATCH", `/api/complaints/${id}`, { action: "assign", staffId }, p);
    expect(assigned.status).toBe(200);
    expect(assigned.json.data.status).toBe("IN_PROGRESS");

    await as(maintId, "MAINTENANCE");
    const resolved = await call(one.PATCH as Handler, "PATCH", `/api/complaints/${id}`, { action: "status", status: "RESOLVED", note: "Washer replaced" }, p);
    expect(resolved.status).toBe(200);

    await as(residentUserId, "RESIDENT");
    const view = await call(one.GET as Handler, "GET", `/api/complaints/${id}`, undefined, p);
    expect(view.status).toBe(200);
    expect(view.json.data.activityAvailable).toBe(true);
    expect(view.json.data.activity.map((a: { action: string }) => a.action)).toEqual(["CREATED", "ASSIGNED", "STATUS_CHANGED"]);
  });

  it("registers a visitor, records the exit once, and rejects a second exit", async () => {
    const visitors = await import("@/app/api/visitors/route");
    const one = await import("@/app/api/visitors/[id]/route");
    await as(securityId, "SECURITY");

    const bad = await call(visitors.POST as Handler, "POST", "/api/visitors", { visitorName: `${tag} V`, purpose: "Delivery", apartmentId: apt, hostResidentId: 999999999 });
    expect(bad.status).toBe(400);

    const made = await call(visitors.POST as Handler, "POST", "/api/visitors", {
      visitorName: `${tag} Visitor`, purpose: "Delivery", apartmentId: apt, hostResidentId: otherResident,
    });
    expect(made.status).toBe(201);
    expect(made.json.data.status).toBe("INSIDE");
    const id = made.json.data.id as string;
    visitorIds.push(id);

    const first = await call(one.PATCH as Handler, "PATCH", `/api/visitors/${id}`, { action: "exit" }, { id });
    expect(first.status).toBe(200);
    expect(first.json.data.status).toBe("EXITED");
    expect((await call(one.PATCH as Handler, "PATCH", `/api/visitors/${id}`, { action: "exit" }, { id })).status).toBe(409);

    await as(residentUserId, "RESIDENT");
    expect((await call(visitors.GET as Handler, "GET", "/api/visitors")).status).toBe(403);
  });

  it("lists host residents for security but only id and name", async () => {
    const { GET } = await import("@/app/api/residents/hosts/route");
    await as(securityId, "SECURITY");
    const res = await call(GET as Handler, "GET", `/api/residents/hosts?apartmentId=${apt}`);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ id: otherResident, name: `${tag} Host` }]);
    await as(residentUserId, "RESIDENT");
    expect((await call(GET as Handler, "GET", `/api/residents/hosts?apartmentId=${apt}`)).status).toBe(403);
  });

  it("revokes the session on logout", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    await as(residentUserId, "RESIDENT");
    const stolen = jar.token;
    expect((await call(GET as Handler, "GET", "/api/auth/session")).status).toBe(200);
    await call(logout as unknown as Handler, "POST", "/api/auth/logout");
    jar.token = stolen; // attacker replays the old cookie
    expect((await call(GET as Handler, "GET", "/api/auth/session")).status).toBe(401);
    await new Promise((r) => setTimeout(r, 5));
    await as(residentUserId, "RESIDENT"); // a fresh login still works
    expect((await call(GET as Handler, "GET", "/api/auth/session")).status).toBe(200);
  });
});
