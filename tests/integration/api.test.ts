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

async function call(route: unknown, method: string, url: string, body?: unknown, params: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", host: "localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (route as Handler)(req, { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json()) as any };
}

d("API against live databases", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let signSession: typeof import("@/lib/session-token").signSession;
  let mongoose: typeof import("mongoose").default;
  const tag = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 9);
  const ids = { apartments: [] as number[], residents: [] as number[], vehicles: [] as number[], slots: [] as number[], complaints: [] as number[], requests: [] as number[], accountUsernames: [] as string[], staff: [] as number[] };
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
    await prisma.accountRequest.deleteMany({ where: { id: { in: ids.requests } } });
    await prisma.userAccount.deleteMany({ where: { username: { in: ids.accountUsernames } } });
    await prisma.loginAttempt.deleteMany({ where: { identifier: { in: [...ids.accountUsernames, "request:local"] } } });
    await prisma.complaint.deleteMany({ where: { id: { in: ids.complaints } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: ids.vehicles } } });
    await prisma.parkingSpace.deleteMany({ where: { id: { in: ids.slots } } });
    await prisma.maintenancePayment.deleteMany({ where: { apartmentId: { in: ids.apartments } } });
    await prisma.userAccount.deleteMany({ where: { residencies: { some: { id: { in: ids.residents } } } } });
    await prisma.staff.deleteMany({ where: { id: { in: ids.staff } } });
    await prisma.resident.deleteMany({ where: { id: { in: ids.residents } } });
    await prisma.apartment.deleteMany({ where: { id: { in: ids.apartments } } });
    await prisma.$disconnect();
    await mongoose.disconnect();
  });

  it("rejects unauthenticated requests with 401", async () => {
    jar.token = undefined;
    const { GET } = await import("@/app/api/payments/route");
    expect((await call(GET, "GET", "/api/payments")).status).toBe(401);
  });

  it("rejects a duplicate monthly bill with 409", async () => {
    await as(adminId, "ADMIN");
    const { POST } = await import("@/app/api/payments/route");
    const bill = { apartmentId: apt, amount: 2500, paymentMonth: "2031-01", status: "PENDING" };
    expect((await call(POST, "POST", "/api/payments", bill)).status).toBe(201);
    const dup = await call(POST, "POST", "/api/payments", bill);
    expect(dup.status).toBe(409);
    expect(await prisma.maintenancePayment.count({ where: { apartmentId: apt } })).toBe(1);
  });

  it("validates payment state (PAID needs a date)", async () => {
    await as(adminId, "ADMIN");
    const { POST } = await import("@/app/api/payments/route");
    const res = await call(POST, "POST", "/api/payments", { apartmentId: apt, amount: 10, paymentMonth: "2031-02", status: "PAID" });
    expect(res.status).toBe(400);
  });

  it("denies payments to security (403) and scopes residents to their own flat", async () => {
    const { GET } = await import("@/app/api/payments/route");
    await as(securityId, "SECURITY");
    expect((await call(GET, "GET", "/api/payments")).status).toBe(403);

    await as(residentUserId, "RESIDENT");
    const own = await prisma.userAccount.findUniqueOrThrow({ where: { id: residentUserId }, include: { residencies: { where: { isActive: true, residentType: "OWNER" } } } });
    const ownedFlats = own.residencies.map((r) => r.apartmentId);
    const res = await call(GET, "GET", `/api/payments?apartmentId=${apt}&pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.json.data.every((p: { apartmentId: number }) => ownedFlats.includes(p.apartmentId))).toBe(true);
    expect(res.json.data.some((p: { apartmentId: number }) => p.apartmentId === apt)).toBe(false);
  });

  describe("parking", () => {
    it("blocks incompatible type and double allocation, and keeps both sides consistent", async () => {
      await as(adminId, "ADMIN");
      const parking = await import("@/app/api/parking/route");
      const parkingId = await import("@/app/api/parking/[id]/route");

      const car = await call(parking.POST, "POST", "/api/parking", { slotNumber: `${tag}C`, vehicleType: "CAR" });
      expect(car.status).toBe(201);
      ids.slots.push(car.json.data.id);

      const [bike, car1, car2] = await Promise.all(
        [["BIKE", "B"], ["CAR", "1"], ["CAR", "2"]].map(([type, s]) =>
          prisma.vehicle.create({ data: { residentId: otherResident, vehicleNumber: `${tag}${s}`, vehicleType: type as "BIKE" | "CAR" } }),
        ),
      );
      ids.vehicles.push(bike.id, car1.id, car2.id);

      const slot = String(car.json.data.id);
      const patch = (vehicleId: number) => call(parkingId.PATCH, "PATCH", `/api/parking/${slot}`, { action: "allocate", vehicleId }, { id: slot });

      expect((await patch(bike.id)).status).toBe(400); // bike into car slot
      expect((await patch(car1.id)).status).toBe(200);
      expect((await patch(car2.id)).status).toBe(409); // already allocated

      const held = await prisma.vehicle.findUniqueOrThrow({ where: { id: car1.id } });
      expect(held.parkingId).toBe(car.json.data.id);

      expect((await call(parkingId.DELETE, "DELETE", `/api/parking/${slot}`, undefined, { id: slot })).status).toBe(409);
      const rel = await call(parkingId.PATCH, "PATCH", `/api/parking/${slot}`, { action: "release" }, { id: slot });
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
        vs.map((v) => call(parkingId.PATCH, "PATCH", `/api/parking/${id}`, { action: "allocate", vehicleId: v.id }, { id })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  it("runs the complaint lifecycle with a MongoDB timeline and role checks", async () => {
    const complaints = await import("@/app/api/complaints/route");
    const one = await import("@/app/api/complaints/[id]/route");

    await as(residentUserId, "RESIDENT");
    const filed = await call(complaints.POST, "POST", "/api/complaints", { category: "Plumbing", description: `${tag} leaking tap in kitchen` });
    expect(filed.status).toBe(201);
    const id = String(filed.json.data.id);
    ids.complaints.push(filed.json.data.id);
    const p = { id };

    // Residents cannot assign or change status.
    expect((await call(one.PATCH, "PATCH", `/api/complaints/${id}`, { action: "assign", staffId }, p)).status).toBe(403);

    // Status change before assignment is refused.
    await as(adminId, "ADMIN");
    expect((await call(one.PATCH, "PATCH", `/api/complaints/${id}`, { action: "status", status: "RESOLVED" }, p)).status).toBe(400);

    // Maintenance cannot see a complaint that is not assigned to them.
    await as(maintId, "MAINTENANCE");
    expect((await call(one.GET, "GET", `/api/complaints/${id}`, undefined, p)).status).toBe(403);

    await as(adminId, "ADMIN");
    const assigned = await call(one.PATCH, "PATCH", `/api/complaints/${id}`, { action: "assign", staffId }, p);
    expect(assigned.status).toBe(200);
    expect(assigned.json.data.status).toBe("IN_PROGRESS");

    await as(maintId, "MAINTENANCE");
    const resolved = await call(one.PATCH, "PATCH", `/api/complaints/${id}`, { action: "status", status: "RESOLVED", note: "Washer replaced" }, p);
    expect(resolved.status).toBe(200);

    await as(residentUserId, "RESIDENT");
    const view = await call(one.GET, "GET", `/api/complaints/${id}`, undefined, p);
    expect(view.status).toBe(200);
    expect(view.json.data.activityAvailable).toBe(true);
    expect(view.json.data.activity.map((a: { action: string }) => a.action)).toEqual(["CREATED", "ASSIGNED", "STATUS_CHANGED"]);
  });

  it("registers a visitor, records the exit once, and rejects a second exit", async () => {
    const visitors = await import("@/app/api/visitors/route");
    const one = await import("@/app/api/visitors/[id]/route");
    await as(securityId, "SECURITY");

    const bad = await call(visitors.POST, "POST", "/api/visitors", { visitorName: `${tag} V`, purpose: "Delivery", apartmentId: apt, hostResidentId: 999999999 });
    expect(bad.status).toBe(400);

    const made = await call(visitors.POST, "POST", "/api/visitors", {
      visitorName: `${tag} Visitor`, purpose: "Delivery", apartmentId: apt, hostResidentId: otherResident,
    });
    expect(made.status).toBe(201);
    expect(made.json.data.status).toBe("INSIDE");
    const id = made.json.data.id as string;
    visitorIds.push(id);

    const first = await call(one.PATCH, "PATCH", `/api/visitors/${id}`, { action: "exit" }, { id });
    expect(first.status).toBe(200);
    expect(first.json.data.status).toBe("EXITED");
    expect((await call(one.PATCH, "PATCH", `/api/visitors/${id}`, { action: "exit" }, { id })).status).toBe(409);

    await as(residentUserId, "RESIDENT");
    expect((await call(visitors.GET, "GET", "/api/visitors")).status).toBe(403);
  });

  it("lists host residents for security but only id and name", async () => {
    const { GET } = await import("@/app/api/residents/hosts/route");
    await as(securityId, "SECURITY");
    const res = await call(GET, "GET", `/api/residents/hosts?apartmentId=${apt}`);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ id: otherResident, name: `${tag} Host` }]);
    await as(residentUserId, "RESIDENT");
    expect((await call(GET, "GET", `/api/residents/hosts?apartmentId=${apt}`)).status).toBe(403);
  });

  it("runs the account request flow: public request, admin approval, sign-in as the new account", async () => {
    const reqRoute = await import("@/app/api/auth/request-account/route");
    const list = await import("@/app/api/account-requests/route");
    const one = await import("@/app/api/account-requests/[id]/route");
    const login = await import("@/app/api/auth/login/route");
    const session = await import("@/app/api/auth/session/route");
    const uname = `${tag.toLowerCase()}.new`;
    const password = "a-long-enough-password";
    const body = { fullName: `${tag} Newcomer`, username: uname, email: `${uname}@example.test`, password, requestedRole: "RESIDENT", flatInfo: `${tag}-1` };
    jar.token = undefined;
    await prisma.loginAttempt.deleteMany({ where: { identifier: { startsWith: "request:" } } });

    // Anyone can ask; invalid input and duplicates are refused.
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", { ...body, password: "short" })).status).toBe(400);
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", { ...body, requestedRole: "ADMIN" })).status).toBe(400);
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", body)).status).toBe(201);
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", body)).status).toBe(409);
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", { ...body, username: "admin", email: "other@example.test" })).status).toBe(409);

    // The request cannot sign in yet, and the password is stored hashed.
    expect((await call(login.POST, "POST", "/api/auth/login", { identifier: uname, password })).status).toBe(401);
    const row = await prisma.accountRequest.findFirstOrThrow({ where: { username: uname } });
    expect(row.status).toBe("PENDING");
    expect(row.passwordHash).not.toContain(password);
    ids.requests.push(row.id);

    // Only admins can see or review requests; the hash is never returned.
    await as(residentUserId, "RESIDENT");
    expect((await call(list.GET, "GET", "/api/account-requests")).status).toBe(403);
    await as(adminId, "ADMIN");
    const listed = await call(list.GET, "GET", `/api/account-requests?status=PENDING&q=${uname}`);
    expect(listed.json.data).toHaveLength(1);
    expect(JSON.stringify(listed.json)).not.toContain("passwordHash");

    // Approval must link a resident; then it creates the account exactly once.
    const p = { id: String(row.id) };
    expect((await call(one.PATCH, "PATCH", `/api/account-requests/${row.id}`, { action: "approve", role: "RESIDENT" }, p)).status).toBe(400);
    expect((await prisma.accountRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING"); // rolled back
    const ok = await call(one.PATCH, "PATCH", `/api/account-requests/${row.id}`, { action: "approve", role: "RESIDENT", residentId: otherResident }, p);
    expect(ok.status).toBe(200);
    expect(ok.json.data.status).toBe("APPROVED");
    expect((await call(one.PATCH, "PATCH", `/api/account-requests/${row.id}`, { action: "reject" }, p)).status).toBe(409);

    // The requester signs in with the password they chose, as a resident of that flat.
    jar.token = undefined;
    expect((await call(login.POST, "POST", "/api/auth/login", { identifier: uname, password })).status).toBe(200);
    const me = await call(session.GET, "GET", "/api/auth/session");
    expect(me.json.data).toMatchObject({ username: uname, role: "RESIDENT", residentIds: [otherResident] });
    ids.accountUsernames.push(uname);

    // Rejection path.
    const rej = { ...body, username: `${uname}2`, email: `${uname}2@example.test` };
    jar.token = undefined;
    expect((await call(reqRoute.POST, "POST", "/api/auth/request-account", rej)).status).toBe(201);
    const r2 = await prisma.accountRequest.findFirstOrThrow({ where: { username: rej.username } });
    ids.requests.push(r2.id);
    await as(adminId, "ADMIN");
    const rejected = await call(one.PATCH, "PATCH", `/api/account-requests/${r2.id}`, { action: "reject", note: "Not a resident" }, { id: String(r2.id) });
    expect(rejected.json.data).toMatchObject({ status: "REJECTED", reviewNote: "Not a resident" });
    expect(await prisma.userAccount.count({ where: { username: rej.username } })).toBe(0);
  });

  it("gives owners and tenants different access (bills, household, dashboard)", async () => {
    const payments = await import("@/app/api/payments/route");
    const summary = await import("@/app/api/payments/summary/route");
    const residents = await import("@/app/api/residents/route");
    const dash = await import("@/app/api/dashboard/route");
    const sessionRoute = await import("@/app/api/auth/session/route");

    // One flat with an owner and a tenant, each with a login.
    const flat = await prisma.apartment.create({ data: { block: tag, floorNo: 2, flatNo: "2", bhk: 3 } });
    ids.apartments.push(flat.id);
    const [owner, tenant] = await Promise.all(
      (["OWNER", "TENANT"] as const).map((t) => prisma.resident.create({ data: { apartmentId: flat.id, name: `${tag} ${t}`, residentType: t } })),
    );
    ids.residents.push(owner.id, tenant.id);
    const [ownerAcc, tenantAcc] = await Promise.all(
      [owner, tenant].map((r) =>
        prisma.userAccount.create({ data: { username: `${tag.toLowerCase()}.${r.residentType.toLowerCase()}`, email: `${tag.toLowerCase()}.${r.residentType.toLowerCase()}@example.test`, passwordHash: "x", role: "RESIDENT" } }),
      ),
    );
    await prisma.resident.update({ where: { id: owner.id }, data: { accountId: ownerAcc.id } });
    await prisma.resident.update({ where: { id: tenant.id }, data: { accountId: tenantAcc.id } });
    ids.accountUsernames.push(ownerAcc.username, tenantAcc.username);
    await prisma.maintenancePayment.create({ data: { apartmentId: flat.id, amount: 1800, paymentMonth: "2031-03", status: "PENDING" } });

    // Owner: sees the flat's bills and the whole household, with an owner dashboard.
    await as(ownerAcc.id, "RESIDENT");
    const bills = await call(payments.GET, "GET", "/api/payments");
    expect(bills.status).toBe(200);
    expect(bills.json.data).toHaveLength(1);
    expect((await call(summary.GET, "GET", "/api/payments/summary")).status).toBe(200);
    const household = await call(residents.GET, "GET", "/api/residents?pageSize=50");
    expect(household.json.data.map((r: { name: string }) => r.name).sort()).toEqual([`${tag} OWNER`, `${tag} TENANT`]);
    expect((await call(sessionRoute.GET, "GET", "/api/auth/session")).json.data).toMatchObject({ isOwner: true, isTenant: false });
    const ownerStats = (await call(dash.GET, "GET", "/api/dashboard")).json.data.stats.map((x: { key: string }) => x.key);
    expect(ownerStats).toEqual(expect.arrayContaining(["pending", "pendingAmount", "household"]));

    // Tenant: no bills at all, only their own profile, and a dashboard without billing figures.
    await as(tenantAcc.id, "RESIDENT");
    expect((await call(payments.GET, "GET", "/api/payments")).status).toBe(403);
    expect((await call(summary.GET, "GET", "/api/payments/summary")).status).toBe(403);
    const own = await call(residents.GET, "GET", "/api/residents?pageSize=50");
    expect(own.json.data.map((r: { name: string }) => r.name)).toEqual([`${tag} TENANT`]);
    expect((await call(sessionRoute.GET, "GET", "/api/auth/session")).json.data).toMatchObject({ isOwner: false, isTenant: true });
    const tenantStats = (await call(dash.GET, "GET", "/api/dashboard")).json.data.stats.map((x: { key: string }) => x.key);
    expect(tenantStats).not.toContain("pending");
    expect(tenantStats).not.toContain("household");
  });

  describe("one person with several flats", () => {
    it("owns flat A, rents flat B: bills only for A, both flats elsewhere, and actions name the flat", async () => {
      const payments = await import("@/app/api/payments/route");
      const paymentOne = await import("@/app/api/payments/[id]/route");
      const aptOne = await import("@/app/api/apartments/[id]/route");
      const residents = await import("@/app/api/residents/route");
      const complaints = await import("@/app/api/complaints/route");
      const feedback = await import("@/app/api/feedback/route");
      const notices = await import("@/app/api/notices/route");
      const sessionRoute = await import("@/app/api/auth/session/route");
      const accountOne = await import("@/app/api/accounts/[id]/route");

      const [flatA, flatB] = await Promise.all(
        ["A", "B"].map((f, i) => prisma.apartment.create({ data: { block: tag, floorNo: 3 + i, flatNo: `M${f}`, bhk: 2 } })),
      );
      ids.apartments.push(flatA.id, flatB.id);
      // Same name, phone and email in both rows: allowed now that contact details are not unique.
      const contact = { name: `${tag} Multi`, phone: "9811100000", email: `${tag.toLowerCase()}.multi@example.test` };
      const ownsA = await prisma.resident.create({ data: { ...contact, apartmentId: flatA.id, residentType: "OWNER" } });
      const rentsB = await prisma.resident.create({ data: { ...contact, apartmentId: flatB.id, residentType: "TENANT" } });
      const landlordB = await prisma.resident.create({ data: { apartmentId: flatB.id, name: `${tag} Landlord`, residentType: "OWNER" } });
      ids.residents.push(ownsA.id, rentsB.id, landlordB.id);
      const acc = await prisma.userAccount.create({ data: { username: `${tag.toLowerCase()}.multi`, email: contact.email, passwordHash: "x", role: "RESIDENT" } });
      ids.accountUsernames.push(acc.username);

      // Admin links both flats to one login; linking the same row twice or a second row in the same flat is refused.
      await as(adminId, "ADMIN");
      const patch = (json: unknown) => call(accountOne.PATCH, "PATCH", `/api/accounts/${acc.id}`, json, { id: String(acc.id) });
      expect((await patch({ linkResidentId: ownsA.id })).status).toBe(200);
      expect((await patch({ linkResidentId: rentsB.id })).status).toBe(200);
      const dupSameFlat = await prisma.resident.create({ data: { apartmentId: flatA.id, name: `${tag} Dup`, residentType: "TENANT" } });
      ids.residents.push(dupSameFlat.id);
      expect((await patch({ linkResidentId: dupSameFlat.id })).status).toBe(409);
      expect((await patch({ linkResidentId: landlordB.id })).status).toBe(409); // the login already has a row in flat B

      const [billA, billB] = await Promise.all(
        [flatA, flatB].map((f) => prisma.maintenancePayment.create({ data: { apartmentId: f.id, amount: 2000, paymentMonth: "2031-04", status: "PENDING" } })),
      );

      await as(acc.id, "RESIDENT");
      const me = (await call(sessionRoute.GET, "GET", "/api/auth/session")).json.data;
      expect(me.apartmentIds.sort()).toEqual([flatA.id, flatB.id].sort());
      expect(me.ownedApartmentIds).toEqual([flatA.id]);
      expect(me).toMatchObject({ isOwner: true, isTenant: true });

      // Bills: flat A only, even when asking for flat B explicitly or by id.
      const bills = await call(payments.GET, "GET", "/api/payments?pageSize=100");
      expect(bills.json.data.map((b: { id: number }) => b.id)).toEqual([billA.id]);
      expect((await call(payments.GET, "GET", `/api/payments?apartmentId=${flatB.id}`)).json.data).toHaveLength(0);
      expect((await call(paymentOne.GET, "GET", `/api/payments/${billB.id}`, undefined, { id: String(billB.id) })).status).toBe(403);

      // Flat details: owner view for A (bills + household), tenant view for B (no bills, no neighbours).
      const a = (await call(aptOne.GET, "GET", `/api/apartments/${flatA.id}`, undefined, { id: String(flatA.id) })).json.data;
      const b = (await call(aptOne.GET, "GET", `/api/apartments/${flatB.id}`, undefined, { id: String(flatB.id) })).json.data;
      expect(a.paymentSummary).toBeDefined();
      expect(b.paymentSummary).toBeUndefined();
      expect(b.residents).toBeUndefined();

      // Household: own rows plus everyone in owned flat A; never the landlord of B.
      const visible = (await call(residents.GET, "GET", "/api/residents?pageSize=50")).json.data.map((r: { id: number }) => r.id);
      expect(visible).toEqual(expect.arrayContaining([ownsA.id, rentsB.id, dupSameFlat.id]));
      expect(visible).not.toContain(landlordB.id);

      // Notices: both owner and tenant audiences.
      const { connectMongo } = await import("@/lib/mongodb");
      const { Notice } = await import("@/models");
      await connectMongo();
      const made = await Notice.insertMany(
        ["OWNERS", "TENANTS"].map((audience) => ({ title: `${tag} ${audience}`, body: "x", audience, status: "PUBLISHED", publishedAt: new Date(), createdByUserId: adminId })),
      );
      const seen = (await call(notices.GET, "GET", `/api/notices?q=${tag}&pageSize=50`)).json.data.map((n: { title: string }) => n.title);
      await Notice.deleteMany({ _id: { $in: made.map((m) => m._id) } });
      expect(seen.sort()).toEqual([`${tag} OWNERS`, `${tag} TENANTS`]);

      // Complaints and feedback must say which flat; a flat that is not theirs is refused.
      const c0 = await call(complaints.POST, "POST", "/api/complaints", { category: "Plumbing", description: `${tag} which flat?` });
      expect(c0.status).toBe(400);
      expect((await call(complaints.POST, "POST", "/api/complaints", { category: "Plumbing", description: `${tag} not mine`, residentId: landlordB.id })).status).toBe(403);
      const c1 = await call(complaints.POST, "POST", "/api/complaints", { category: "Plumbing", description: `${tag} tap in flat B`, residentId: rentsB.id });
      expect(c1.status).toBe(201);
      expect(c1.json.data.residentId).toBe(rentsB.id);
      ids.complaints.push(c1.json.data.id);
      expect((await call(feedback.POST, "POST", "/api/feedback", { category: "General", rating: 4, message: "x" })).status).toBe(400);
      const f1 = await call(feedback.POST, "POST", "/api/feedback", { category: "General", rating: 4, message: `${tag} fb`, residentId: ownsA.id });
      expect(f1.status).toBe(201);
      expect(f1.json.data.apartmentId).toBe(flatA.id);
      const { Feedback } = await import("@/models");
      await Feedback.deleteOne({ _id: f1.json.data.id });

      // Moving out of flat B keeps the login (flat A remains); leaving the last flat locks it.
      await as(adminId, "ADMIN");
      const residentOne = await import("@/app/api/residents/[id]/route");
      const deactivate = (rid: number) => call(residentOne.PATCH, "PATCH", `/api/residents/${rid}`, { isActive: false }, { id: String(rid) });
      expect((await deactivate(rentsB.id)).status).toBe(200);
      expect((await prisma.userAccount.findUniqueOrThrow({ where: { id: acc.id } })).isActive).toBe(true);
      await as(acc.id, "RESIDENT");
      expect((await call(sessionRoute.GET, "GET", "/api/auth/session")).json.data.apartmentIds).toEqual([flatA.id]);
      // Unlinking the last active flat is refused; deactivating it locks the login.
      await as(adminId, "ADMIN");
      expect((await patch({ unlinkResidentId: ownsA.id })).status).toBe(400);
      expect((await deactivate(ownsA.id)).status).toBe(200);
      expect((await prisma.userAccount.findUniqueOrThrow({ where: { id: acc.id } })).isActive).toBe(false);
    });
  });

  describe("other edge cases", () => {
    it("a resident moving out releases their parking and retires their vehicles", async () => {
      await as(adminId, "ADMIN");
      const residentOne = await import("@/app/api/residents/[id]/route");
      const r = await prisma.resident.create({ data: { apartmentId: apt, name: `${tag} Mover`, residentType: "TENANT" } });
      ids.residents.push(r.id);
      const slot = await prisma.parkingSpace.create({ data: { slotNumber: `${tag}M`, vehicleType: "CAR", status: "ALLOCATED", apartmentId: apt } });
      ids.slots.push(slot.id);
      const v = await prisma.vehicle.create({ data: { residentId: r.id, vehicleNumber: `${tag}MV`, vehicleType: "CAR", parkingId: slot.id } });
      ids.vehicles.push(v.id);

      // Moving them to another flat while parked is refused.
      const other = await prisma.apartment.create({ data: { block: tag, floorNo: 9, flatNo: "9", bhk: 1 } });
      ids.apartments.push(other.id);
      expect((await call(residentOne.PATCH, "PATCH", `/api/residents/${r.id}`, { apartmentId: other.id }, { id: String(r.id) })).status).toBe(409);

      expect((await call(residentOne.PATCH, "PATCH", `/api/residents/${r.id}`, { isActive: false }, { id: String(r.id) })).status).toBe(200);
      expect(await prisma.parkingSpace.findUniqueOrThrow({ where: { id: slot.id } })).toMatchObject({ status: "AVAILABLE", apartmentId: null });
      expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ isActive: false, parkingId: null });

      // Their vehicle cannot be reactivated while they are inactive.
      const vehicleOne = await import("@/app/api/vehicles/[id]/route");
      expect((await call(vehicleOne.PATCH, "PATCH", `/api/vehicles/${v.id}`, { isActive: true }, { id: String(v.id) })).status).toBe(400);
    });

    it("deactivating staff hands their in-progress complaints back to the queue", async () => {
      await as(adminId, "ADMIN");
      const staffOne = await import("@/app/api/staff/[id]/route");
      const s = await prisma.staff.create({ data: { name: `${tag} Leaver`, role: "Plumber" } });
      ids.staff.push(s.id);
      const c = await prisma.complaint.create({ data: { residentId: otherResident, staffId: s.id, category: "Plumbing", description: `${tag} stuck`, complaintDate: new Date(), status: "IN_PROGRESS" } });
      ids.complaints.push(c.id);
      const res = await call(staffOne.PATCH, "PATCH", `/api/staff/${s.id}`, { isActive: false }, { id: String(s.id) });
      expect(res.status).toBe(200);
      expect(res.json.data.unassignedComplaints).toBe(1);
      expect(await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "OPEN", staffId: null });
    });

    it("rejects payment dates in the future and lets an admin clear a vehicle's brand", async () => {
      await as(adminId, "ADMIN");
      const { POST } = await import("@/app/api/payments/route");
      const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await call(POST, "POST", "/api/payments", { apartmentId: apt, amount: 10, paymentMonth: "2031-05", status: "PAID", paymentDate: future });
      expect(res.status).toBe(400);

      const vehicleOne = await import("@/app/api/vehicles/[id]/route");
      const v = await prisma.vehicle.create({ data: { residentId: otherResident, vehicleNumber: `${tag}BR`, vehicleType: "BIKE", brand: "Honda" } });
      ids.vehicles.push(v.id);
      const cleared = await call(vehicleOne.PATCH, "PATCH", `/api/vehicles/${v.id}`, { brand: null }, { id: String(v.id) });
      expect(cleared.status).toBe(200);
      expect(cleared.json.data.brand).toBeNull();
    });

    it("a password reset signs the person out everywhere", async () => {
      const sessionRoute = await import("@/app/api/auth/session/route");
      const accountOne = await import("@/app/api/accounts/[id]/route");
      const r = await prisma.resident.create({ data: { apartmentId: apt, name: `${tag} Reset`, residentType: "OWNER" } });
      ids.residents.push(r.id);
      const acc = await prisma.userAccount.create({ data: { username: `${tag.toLowerCase()}.reset`, email: `${tag.toLowerCase()}.reset@example.test`, passwordHash: "x", role: "RESIDENT" } });
      ids.accountUsernames.push(acc.username);
      await prisma.resident.update({ where: { id: r.id }, data: { accountId: acc.id } });
      await as(acc.id, "RESIDENT");
      const old = jar.token;
      expect((await call(sessionRoute.GET, "GET", "/api/auth/session")).status).toBe(200);
      await new Promise((res) => setTimeout(res, 5));
      await as(adminId, "ADMIN");
      expect((await call(accountOne.PATCH, "PATCH", `/api/accounts/${acc.id}`, { password: "a-brand-new-password" }, { id: String(acc.id) })).status).toBe(200);
      jar.token = old;
      expect((await call(sessionRoute.GET, "GET", "/api/auth/session")).status).toBe(401);
    });
  });

  it("throttles repeated failed sign-ins in the database (429) and clears on success", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const who = `${tag.toLowerCase()}-nobody`;
    for (let i = 0; i < 5; i++) {
      expect((await call(POST, "POST", "/api/auth/login", { identifier: who, password: "wrong-password" })).status).toBe(401);
    }
    expect((await call(POST, "POST", "/api/auth/login", { identifier: who, password: "wrong-password" })).status).toBe(429);
    expect((await prisma.loginAttempt.findUnique({ where: { identifier: who } }))?.failures).toBe(5);
    await prisma.loginAttempt.deleteMany({ where: { identifier: who } });
  });

  it("revokes the session on logout", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    await as(residentUserId, "RESIDENT");
    const stolen = jar.token;
    expect((await call(GET, "GET", "/api/auth/session")).status).toBe(200);
    await call(logout, "POST", "/api/auth/logout");
    jar.token = stolen; // attacker replays the old cookie
    expect((await call(GET, "GET", "/api/auth/session")).status).toBe(401);
    await new Promise((r) => setTimeout(r, 5));
    await as(residentUserId, "RESIDENT"); // a fresh login still works
    expect((await call(GET, "GET", "/api/auth/session")).status).toBe(200);
  });
});
