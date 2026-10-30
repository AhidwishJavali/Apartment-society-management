import { ok, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { Visitor } from "@/models";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

type Stat = { key: string; label: string; value: number | string; href?: string; error?: boolean };

// Every number is computed from live data; role decides which numbers a viewer may see.
export const GET = route("ANY", async ({ user }) => {
  const stats: Stat[] = [];

  if (user.role === "ADMIN") {
    const [apartments, residents, pending, openComplaints, available] = await Promise.all([
      prisma.apartment.count(),
      prisma.resident.count({ where: { isActive: true } }),
      prisma.maintenancePayment.aggregate({ where: { status: "PENDING" }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.complaint.count({ where: { status: { not: "RESOLVED" } } }),
      prisma.parkingSpace.count({ where: { status: "AVAILABLE" } }),
    ]);
    stats.push(
      { key: "apartments", label: "Apartments", value: apartments, href: "/apartments" },
      { key: "residents", label: "Active residents", value: residents, href: "/residents" },
      { key: "pending", label: "Pending payments", value: pending._count._all, href: "/payments" },
      { key: "pendingAmount", label: "Pending amount (₹)", value: Number(pending._sum.amount ?? 0) },
      { key: "complaints", label: "Open complaints", value: openComplaints, href: "/complaints" },
      { key: "parking", label: "Available parking", value: available, href: "/parking" },
    );
  }

  if (user.role === "RESIDENT") {
    const apartmentId = user.apartmentId ?? -1;
    const [pending, myOpen, parking] = await Promise.all([
      prisma.maintenancePayment.aggregate({ where: { apartmentId, status: "PENDING" }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.complaint.count({ where: { residentId: user.residentId ?? -1, status: { not: "RESOLVED" } } }),
      prisma.parkingSpace.count({ where: { apartmentId } }),
    ]);
    stats.push(
      { key: "pending", label: "Pending bills", value: pending._count._all, href: "/payments" },
      { key: "pendingAmount", label: "Pending balance (₹)", value: Number(pending._sum.amount ?? 0) },
      { key: "complaints", label: "My open complaints", value: myOpen, href: "/complaints" },
      { key: "parking", label: "My parking slots", value: parking, href: "/parking" },
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

  return ok({ stats });
});
