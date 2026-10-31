import { ok, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { Visitor } from "@/models";
import { visibleResidentsWhere } from "@/server/helpers";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

type Charts = {
  payments?: { month: string; paid: number; pending: number }[];
  complaints?: { status: string; count: number }[];
};

type Stat = { key: string; label: string; value: number | string; href?: string; error?: boolean };

// Every number is computed from live data; role decides which numbers a viewer may see.
export const GET = route("ANY", async ({ user }) => {
  const stats: Stat[] = [];
  const charts: Charts = {};

  if (user.role === "ADMIN") {
    const [apartments, residents, pending, openComplaints, available, requests] = await Promise.all([
      prisma.apartment.count(),
      prisma.resident.count({ where: { isActive: true } }),
      prisma.maintenancePayment.aggregate({ where: { status: "PENDING" }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.complaint.count({ where: { status: { not: "RESOLVED" } } }),
      prisma.parkingSpace.count({ where: { status: "AVAILABLE" } }),
      prisma.accountRequest.count({ where: { status: "PENDING" } }),
    ]);
    const [byMonth, byStatus] = await Promise.all([
      prisma.maintenancePayment.groupBy({ by: ["paymentMonth", "status"], _sum: { amount: true }, orderBy: { paymentMonth: "desc" }, take: 24 }),
      prisma.complaint.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const months = new Map<string, { month: string; paid: number; pending: number }>();
    for (const g of byMonth) {
      const row = months.get(g.paymentMonth) ?? { month: g.paymentMonth, paid: 0, pending: 0 };
      row[g.status === "PAID" ? "paid" : "pending"] += Number(g._sum.amount ?? 0);
      months.set(g.paymentMonth, row);
    }
    charts.payments = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
    charts.complaints = byStatus.map((g) => ({ status: g.status, count: g._count._all }));
    stats.push(
      { key: "apartments", label: "Apartments", value: apartments, href: "/apartments" },
      { key: "residents", label: "Active residents", value: residents, href: "/residents" },
      { key: "pending", label: "Pending payments", value: pending._count._all, href: "/payments" },
      { key: "pendingAmount", label: "Pending amount (₹)", value: Number(pending._sum.amount ?? 0) },
      { key: "complaints", label: "Open complaints", value: openComplaints, href: "/complaints" },
      { key: "parking", label: "Available parking", value: available, href: "/parking" },
      { key: "requests", label: "Pending account requests", value: requests, href: "/account-requests" },
    );
  }

  if (user.role === "RESIDENT") {
    const owned = user.ownedApartmentIds;
    const flats = user.apartmentIds.length;
    const [myOpen, parking, vehicles] = await Promise.all([
      prisma.complaint.count({ where: { residentId: { in: user.residentIds }, status: { not: "RESOLVED" } } }),
      prisma.parkingSpace.count({ where: { apartmentId: { in: user.apartmentIds } } }),
      prisma.vehicle.count({ where: { isActive: true, resident: visibleResidentsWhere(user) } }),
    ]);
    if (flats > 1) stats.push({ key: "flats", label: "My flats", value: user.residencies.map((r) => `${r.label} (${r.residentType.toLowerCase()})`).join(", ") });
    if (owned.length > 0) {
      // Owners are billed for the flats they own and see who lives in them.
      const [pending, household] = await Promise.all([
        prisma.maintenancePayment.aggregate({ where: { apartmentId: { in: owned }, status: "PENDING" }, _count: { _all: true }, _sum: { amount: true } }),
        prisma.resident.count({ where: { apartmentId: { in: owned }, isActive: true } }),
      ]);
      stats.push(
        { key: "pending", label: "Pending bills", value: pending._count._all, href: "/payments" },
        { key: "pendingAmount", label: "Pending balance (₹)", value: Number(pending._sum.amount ?? 0) },
        { key: "household", label: owned.length > 1 ? "People in my flats" : "People in my flat", value: household, href: "/residents" },
      );
    }
    stats.push(
      { key: "complaints", label: "My open complaints", value: myOpen, href: "/complaints" },
      { key: "parking", label: flats > 1 ? "Parking slots for my flats" : "Parking slots for my flat", value: parking, href: "/parking" },
      { key: "vehicles", label: owned.length > 0 ? "Vehicles" : "My vehicles", value: vehicles, href: "/vehicles" },
    );
  }

  if (user.role === "MAINTENANCE") {
    const staffId = user.staffId ?? -1;
    const [inProgress, resolved] = await Promise.all([
      prisma.complaint.count({ where: { staffId, status: "IN_PROGRESS" } }),
      prisma.complaint.count({ where: { staffId, status: "RESOLVED" } }),
    ]);
    stats.push(
      { key: "assigned", label: "Assigned & active", value: inProgress, href: "/complaints" },
      { key: "resolved", label: "Resolved by me", value: resolved },
    );
  }

  if (user.role === "ADMIN" || user.role === "SECURITY") {
    try {
      await connectMongo();
      const [today, inside] = await Promise.all([
        Visitor.countDocuments({ entryTime: { $gte: startOfToday() } }),
        Visitor.countDocuments({ status: "INSIDE" }),
      ]);
      stats.push({ key: "visitorsToday", label: "Visitors today", value: today, href: "/visitors" });
      if (user.role === "SECURITY") stats.push({ key: "inside", label: "Currently inside", value: inside, href: "/visitors" });
    } catch {
      stats.push({ key: "visitorsToday", label: "Visitors today", value: "Unavailable", error: true });
    }
  }

  return ok({ stats, charts });
});
