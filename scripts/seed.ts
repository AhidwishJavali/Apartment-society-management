import "./load-env";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { PrismaClient } from "@prisma/client";
import { ComplaintActivity, Feedback, Notice, Visitor } from "../src/models";

const prisma = new PrismaClient();
const reset = process.argv.includes("--reset");
const assumeYes = process.argv.includes("--yes");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Fictional data only. Adapted from db/lab_baseline.sql: same 10-row core tables, plus the
// constraints added by the final schema (unique flat, unique billing month, unassigned = OPEN).
const apartments = [
  [1, "A", 1, "101", 2], [2, "A", 1, "102", 3], [3, "A", 2, "201", 2], [4, "A", 2, "202", 3],
  [5, "B", 1, "101", 2], [6, "B", 1, "102", 3], [7, "B", 2, "201", 2], [8, "B", 2, "202", 3],
  [9, "C", 1, "101", 2], [10, "C", 1, "102", 3],
] as const;

const residents = [
  [1, 1, "Arjun Rao", "9876500001", "arjun@example.test", "OWNER"],
  [2, 2, "Priya Sharma", "9876500002", "priya@example.test", "OWNER"],
  [3, 3, "Rahul Mehta", "9876500003", "rahul@example.test", "TENANT"],
  [4, 4, "Sneha Iyer", "9876500004", "sneha@example.test", "OWNER"],
  [5, 5, "Vikram Singh", "9876500005", "vikram@example.test", "OWNER"],
  [6, 6, "Ananya Patel", "9876500006", "ananya@example.test", "TENANT"],
  [7, 7, "Karan Joshi", "9876500007", "karan@example.test", "OWNER"],
  [8, 8, "Neha Kapoor", "9876500008", "neha@example.test", "OWNER"],
  [9, 9, "Rohan Desai", "9876500009", "rohan@example.test", "TENANT"],
  [10, 10, "Meera Nair", "9876500010", "meera@example.test", "OWNER"],
] as const;

const staff = [
  [1, "Suresh Kumar", "Electrician", "9000000001", 25000], [2, "Ramesh Babu", "Plumber", "9000000002", 24000],
  [3, "Mahesh Rao", "Security Guard", "9000000003", 22000], [4, "Ganesh Kumar", "Security Guard", "9000000004", 22000],
  [5, "Ajay Singh", "Maintenance Supervisor", "9000000005", 32000], [6, "Mohan Das", "Cleaner", "9000000006", 20000],
  [7, "Sunil Patil", "Electrician", "9000000007", 25000], [8, "Ravi Kumar", "Plumber", "9000000008", 24000],
  [9, "Deepak Shah", "Cleaner", "9000000009", 20000], [10, "Vijay Nair", "Maintenance Supervisor", "9000000010", 32000],
] as const;

// Slots 1-10 mirror the baseline allocations; 11 and 12 are free so allocation can be demonstrated.
const parking = [
  [1, 1, "A-P01", "CAR"], [2, 2, "A-P02", "CAR"], [3, 3, "A-P03", "BIKE"], [4, 4, "A-P04", "CAR"],
  [5, 5, "B-P01", "CAR"], [6, 6, "B-P02", "BIKE"], [7, 7, "B-P03", "CAR"], [8, 8, "B-P04", "CAR"],
  [9, 9, "C-P01", "BIKE"], [10, 10, "C-P02", "CAR"], [11, null, "C-P03", "CAR"], [12, null, "C-P04", "BIKE"],
] as const;

const vehicles = [
  [1, 1, 1, "KA01AB1234", "CAR", "Hyundai"], [2, 2, 2, "KA02CD5678", "CAR", "Honda"],
  [3, 3, 3, "KA03EF9012", "BIKE", "Yamaha"], [4, 4, 4, "KA04GH3456", "CAR", "Maruti"],
  [5, 5, 5, "KA05IJ7890", "CAR", "Tata"], [6, 6, 6, "KA06KL1234", "BIKE", "Honda"],
  [7, 7, 7, "KA07MN5678", "CAR", "Toyota"], [8, 8, 8, "KA08OP9012", "CAR", "Kia"],
  [9, 9, 9, "KA09QR3456", "BIKE", "TVS"], [10, 10, 10, "KA10ST7890", "CAR", "Hyundai"],
] as const;

const paid = (apt: number) => [1, 2, 4, 6, 7, 9, 10].includes(apt);
const octAmount = (apt: number) => (apt % 2 === 0 ? 4000 : 3500);
const payments = [
  ...apartments.map(([id]) => [id, octAmount(id), "2026-10", paid(id) ? `2026-10-${String(4 + id).padStart(2, "0")}` : null] as const),
  ...[1, 2, 3, 4, 5].map((id) => [id, octAmount(id), "2026-09", `2026-09-${String(3 + id).padStart(2, "0")}`] as const),
];

// [id, residentId, staffId|null, category, description, date, status]
const complaints = [
  [1, 1, 1, "Electrical", "Corridor light not working", "2026-10-01", "RESOLVED"],
  [2, 2, 2, "Plumbing", "Water leakage in kitchen", "2026-10-02", "IN_PROGRESS"],
  [3, 3, null, "Security", "Intercom not working", "2026-10-03", "OPEN"],
  [4, 4, 1, "Electrical", "Power issue in bedroom", "2026-10-04", "RESOLVED"],
  [5, 5, 2, "Plumbing", "Bathroom tap leakage", "2026-10-05", "RESOLVED"],
  [6, 6, 5, "Maintenance", "Lift maintenance required", "2026-10-06", "IN_PROGRESS"],
  [7, 7, null, "Cleaning", "Staircase requires cleaning", "2026-10-07", "OPEN"],
  [8, 8, 7, "Electrical", "Parking light not working", "2026-10-08", "RESOLVED"],
  [9, 9, 8, "Plumbing", "Low water pressure", "2026-10-09", "IN_PROGRESS"],
  [10, 10, null, "Maintenance", "Door repair required", "2026-10-10", "OPEN"],
] as const;

const DEMO_ACCOUNTS = [
  { username: "admin", email: "admin@society.test", role: "ADMIN", residentId: null, staffId: null },
  { username: "resident", email: "arjun@example.test", role: "RESIDENT", residentId: 1, staffId: null },
  { username: "maintenance", email: "suresh.staff@society.test", role: "MAINTENANCE", residentId: null, staffId: 1 },
  { username: "security", email: "mahesh.staff@society.test", role: "SECURITY", residentId: null, staffId: 3 },
] as const;

async function confirmReset() {
  console.warn("\n!!! RESET DELETES ALL DEMO DATA in both MySQL and MongoDB (every table/collection of this app) !!!");
  if (assumeYes) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type "reset" to continue: ');
  rl.close();
  if (answer.trim() !== "reset") {
    console.log("Aborted, nothing was deleted.");
    process.exit(0);
  }
}

async function wipe() {
  await prisma.$transaction([
    prisma.loginAttempt.deleteMany(),
    prisma.userAccount.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.parkingSpace.deleteMany(),
    prisma.maintenancePayment.deleteMany(),
    prisma.resident.deleteMany(),
    prisma.staff.deleteMany(),
    prisma.apartment.deleteMany(),
  ]);
  await Promise.all([Visitor.deleteMany(), Notice.deleteMany(), ComplaintActivity.deleteMany(), Feedback.deleteMany()]);
}

async function seedMysql() {
  for (const [id, block, floorNo, flatNo, bhk] of apartments) {
    await prisma.apartment.upsert({ where: { id }, update: {}, create: { id, block, floorNo, flatNo, bhk } });
  }
  for (const [id, apartmentId, name, phone, email, residentType] of residents) {
    await prisma.resident.upsert({ where: { id }, update: {}, create: { id, apartmentId, name, phone, email, residentType } });
  }
  for (const [id, name, role, phone, salary] of staff) {
    await prisma.staff.upsert({ where: { id }, update: {}, create: { id, name, role, phone, salary } });
  }
  for (const [id, apartmentId, slotNumber, vehicleType] of parking) {
    const status = apartmentId ? "ALLOCATED" : "AVAILABLE";
    await prisma.parkingSpace.upsert({ where: { id }, update: {}, create: { id, apartmentId, slotNumber, vehicleType, status } });
  }
  for (const [id, residentId, parkingId, vehicleNumber, vehicleType, brand] of vehicles) {
    await prisma.vehicle.upsert({ where: { id }, update: {}, create: { id, residentId, parkingId, vehicleNumber, vehicleType, brand } });
  }
  for (const [apartmentId, amount, paymentMonth, date] of payments) {
    await prisma.maintenancePayment.upsert({
      where: { apartmentId_paymentMonth: { apartmentId, paymentMonth } },
      update: {},
      create: { apartmentId, amount, paymentMonth, status: date ? "PAID" : "PENDING", paymentDate: date ? d(date) : null },
    });
  }
  for (const [id, residentId, staffId, category, description, date, status] of complaints) {
    await prisma.complaint.upsert({
      where: { id },
      update: {},
      create: { id, residentId, staffId, category, description, complaintDate: d(date), status },
    });
  }
}

/** Creates missing demo accounts with freshly generated passwords; existing accounts are left untouched. */
async function seedAccounts() {
  const created: { username: string; password: string; role: string }[] = [];
  for (const account of DEMO_ACCOUNTS) {
    if (await prisma.userAccount.findUnique({ where: { username: account.username } })) continue;
    const password = randomBytes(9).toString("base64url");
    await prisma.userAccount.create({ data: { ...account, passwordHash: await bcrypt.hash(password, 12) } });
    created.push({ username: account.username, password, role: account.role });
  }
  return created;
}

async function seedMongo() {
  const accounts = await prisma.userAccount.findMany();
  const idOf = (role: string) => accounts.find((a) => a.role === role)?.id ?? 1;
  const adminId = idOf("ADMIN");
  const securityId = idOf("SECURITY");
  const day = (n: number, h = 9, m = 0) => new Date(Date.UTC(2026, 9, n, h, m));

  if ((await ComplaintActivity.estimatedDocumentCount()) === 0) {
    const docs = complaints.flatMap(([id, residentId, staffId, , description, date, status]) => {
      const created = new Date(`${date}T08:30:00.000Z`);
      const events: Record<string, unknown>[] = [
        { complaintId: id, actorUserId: residentId === 1 ? idOf("RESIDENT") : adminId, actorRole: residentId === 1 ? "RESIDENT" : "ADMIN", action: "CREATED", newStatus: "OPEN", note: description, createdAt: created },
      ];
      if (staffId) {
        events.push({ complaintId: id, actorUserId: adminId, actorRole: "ADMIN", action: "ASSIGNED", oldStatus: "OPEN", newStatus: "IN_PROGRESS", note: "Assigned to maintenance", createdAt: new Date(created.getTime() + 3600_000) });
      }
      if (status === "RESOLVED") {
        events.push({ complaintId: id, actorUserId: idOf("MAINTENANCE"), actorRole: "MAINTENANCE", action: "STATUS_CHANGED", oldStatus: "IN_PROGRESS", newStatus: "RESOLVED", note: "Work completed", createdAt: new Date(created.getTime() + 86_400_000) });
      }
      return events;
    });
    await ComplaintActivity.insertMany(docs);
  }

  if ((await Visitor.estimatedDocumentCount()) === 0) {
    const names = ["Anil Verma", "Kavya Reddy", "Farhan Ali", "Isha Menon", "Tarun Gupta", "Lata Pillai", "Dev Malhotra", "Sana Khan", "Naveen Rao", "Pooja Bhat"];
    await Visitor.insertMany(
      names.map((visitorName, i) => ({
        visitorName,
        phone: `98450000${String(i).padStart(2, "0")}`,
        purpose: ["Family visit", "Delivery", "Plumbing work", "Guest", "Courier"][i % 5],
        apartmentId: (i % 10) + 1,
        hostResidentId: (i % 10) + 1,
        vehicleNumber: i % 3 === 0 ? `KA51ZZ${1000 + i}` : undefined,
        entryTime: day(20 + (i % 8), 10 + (i % 6)),
        exitTime: i < 8 ? day(20 + (i % 8), 12 + (i % 6)) : undefined,
        status: i < 8 ? "EXITED" : "INSIDE",
        recordedByUserId: securityId,
      })),
    );
  }

  if ((await Notice.estimatedDocumentCount()) === 0) {
    const items: [string, string, string, string, string, string][] = [
      ["NOTICE", "Water tank cleaning", "Water supply will be off 10am-2pm on Sunday for tank cleaning.", "Maintenance", "HIGH", "ALL"],
      ["NOTICE", "Annual general meeting", "AGM will be held in the clubhouse on the last Saturday of the month.", "Meeting", "NORMAL", "OWNERS"],
      ["ANNOUNCEMENT", "Diwali celebrations", "Join us in the central courtyard for the Diwali get-together.", "Event", "NORMAL", "ALL"],
      ["NOTICE", "Rental agreement renewal", "Tenants must submit renewed agreements to the office by month end.", "Admin", "NORMAL", "TENANTS"],
      ["NOTICE", "Lift servicing schedule", "Block B lifts will be serviced on Wednesday between 11am and 1pm.", "Maintenance", "NORMAL", "MAINTENANCE"],
      ["NOTICE", "Gate pass procedure update", "All visitors must be logged at the gate before entry.", "Security", "HIGH", "SECURITY"],
      ["ANNOUNCEMENT", "Parking line repainting", "Basement parking lines will be repainted this weekend.", "Parking", "LOW", "ALL"],
      ["NOTICE", "Pest control", "Pest control for common areas is scheduled for next Tuesday.", "Maintenance", "NORMAL", "ALL"],
      ["ANNOUNCEMENT", "Welcome new residents", "Please welcome the new residents of Block C.", "Community", "LOW", "ALL"],
      ["NOTICE", "Draft: Terrace access rules", "Draft rules for terrace access, pending committee review.", "Policy", "LOW", "ALL"],
    ];
    await Notice.insertMany(
      items.map(([documentType, title, body, category, priority, audience], i) => ({
        documentType, title, body, category, priority, audience,
        status: i === 9 ? "DRAFT" : i === 8 ? "ARCHIVED" : "PUBLISHED",
        publishedAt: i === 9 ? undefined : day(5 + i),
        expiresAt: i === 7 ? day(12) : undefined, // an already-expired notice to demonstrate filtering
        createdByUserId: adminId,
      })),
    );
  }

  if ((await Feedback.estimatedDocumentCount()) === 0) {
    const categories = ["Cleanliness", "Security", "Amenities", "Maintenance", "Parking"];
    const messages = [
      "Common areas are well maintained.", "Gate staff are very helpful.", "Please add more seating in the garden.",
      "Water pressure drops in the evenings.", "Visitor parking is often full.", "Lifts are slow during peak hours.",
      "Great response time on my last complaint.", "Street lights near Block C need attention.", "Clubhouse timings could be extended.",
      "Garbage collection is timely.",
    ];
    await Feedback.insertMany(
      messages.map((message, i) => ({
        residentId: i + 1,
        apartmentId: i + 1,
        category: categories[i % categories.length],
        rating: (i % 5) + 1,
        message,
        submittedAt: day(10 + i, 15),
        status: (["NEW", "REVIEWED", "RESOLVED"] as const)[i % 3],
      })),
    );
  }
}

async function main() {
  if (reset) await confirmReset();
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 8000 });
  if (reset) {
    await wipe();
    console.log("Existing data deleted.");
  }
  await seedMysql();
  const created = await seedAccounts();
  await seedMongo();

  if (created.length) {
    const lines = created.map((a) => `${a.role.padEnd(12)} username: ${a.username.padEnd(12)} password: ${a.password}`);
    console.log("\nDemo accounts created (shown once, also saved to .demo-credentials.local):\n" + lines.join("\n"));
    writeFileSync(".demo-credentials.local", lines.join("\n") + "\n", { mode: 0o600 });
  } else {
    console.log("\nDemo accounts already exist - passwords unchanged. Run `npm run db:reset` to regenerate them.");
  }
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
