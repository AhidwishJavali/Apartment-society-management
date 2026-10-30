import type { Prisma } from "@prisma/client";
import { ok, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { paymentQuery } from "@/lib/schemas";

// Totals are computed in MySQL for the same filters the list endpoint accepts.
export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, paymentQuery);
  const where: Prisma.MaintenancePaymentWhereInput = {};
  if (user.role === "RESIDENT") where.apartmentId = user.apartmentId ?? -1;
  else if (q.apartmentId) where.apartmentId = q.apartmentId;
  if (q.month) where.paymentMonth = q.month;
  if (q.q) where.apartment = { OR: [{ block: { contains: q.q } }, { flatNo: { contains: q.q } }] };

  const groups = await prisma.maintenancePayment.groupBy({
    by: ["status"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
  const get = (s: "PAID" | "PENDING") => groups.find((g) => g.status === s);
  return ok({
    paidTotal: get("PAID")?._sum.amount ?? 0,
    paidCount: get("PAID")?._count._all ?? 0,
    pendingTotal: get("PENDING")?._sum.amount ?? 0,
    pendingCount: get("PENDING")?._count._all ?? 0,
  });
});
