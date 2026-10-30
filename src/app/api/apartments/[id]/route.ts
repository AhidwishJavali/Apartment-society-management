import { conflict, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { apartmentPatch } from "@/lib/schemas";
import { assertApartmentAccess } from "@/server/helpers";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const id = parseId(params.id);
  assertApartmentAccess(user, id);
  const apartment = await prisma.apartment.findUnique({
    where: { id },
    include: {
      // Neighbours' details are admin-only; residents get the flat and payment summary.
      residents: user.role === "ADMIN" ? { select: { id: true, name: true, residentType: true, isActive: true } } : false,
    },
  });
  if (!apartment) throw notFound("Apartment");

  const totals = await prisma.maintenancePayment.groupBy({
    by: ["status"],
    where: { apartmentId: id },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const pick = (status: "PAID" | "PENDING") => totals.find((t) => t.status === status);
  return ok({
    ...apartment,
    paymentSummary: {
      paidTotal: pick("PAID")?._sum.amount ?? 0,
      paidCount: pick("PAID")?._count._all ?? 0,
      pendingTotal: pick("PENDING")?._sum.amount ?? 0,
      pendingCount: pick("PENDING")?._count._all ?? 0,
    },
  });
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, apartmentPatch);
  return ok(await prisma.apartment.update({ where: { id }, data: body }));
});

// Guarded delete: flats with residents, parking or payment history must be kept.
export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  const [residents, parking, payments] = await Promise.all([
    prisma.resident.count({ where: { apartmentId: id } }),
    prisma.parkingSpace.count({ where: { apartmentId: id } }),
    prisma.maintenancePayment.count({ where: { apartmentId: id } }),
  ]);
  if (residents + parking + payments > 0) {
    throw conflict("This apartment has residents, parking or payment history and cannot be deleted");
  }
  await prisma.apartment.delete({ where: { id } });
  return ok({ deleted: true });
});
