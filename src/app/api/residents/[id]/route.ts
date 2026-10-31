import { conflict, forbidden, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { residentPatch } from "@/lib/schemas";
import { releaseSlot } from "@/server/parking";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const id = parseId(params.id);
  const resident = await prisma.resident.findUnique({
    where: { id },
    include: { apartment: true, vehicles: true },
  });
  if (!resident) throw notFound("Resident");
  // Own residency rows, or anyone in a flat this user owns.
  if (user.role === "RESIDENT" && !user.residentIds.includes(id) && !user.ownedApartmentIds.includes(resident.apartmentId)) throw forbidden();
  return ok(resident);
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, residentPatch);

  const resident = await prisma.$transaction(async (tx) => {
    const existing = await tx.resident.findUnique({ where: { id }, include: { vehicles: true } });
    if (!existing) throw notFound("Resident");

    // Moving someone to another flat would leave their parked vehicles on the old flat's slots.
    if (body.apartmentId !== undefined && body.apartmentId !== existing.apartmentId && existing.vehicles.some((v) => v.parkingId !== null)) {
      throw conflict("Release this resident's parking slots before moving them to another flat");
    }

    const updated = await tx.resident.update({ where: { id }, data: body });

    if (body.isActive === false && existing.isActive) {
      // Moving out: free their parking and retire their vehicles in the same transaction.
      for (const v of existing.vehicles) if (v.parkingId) await releaseSlot(tx, v.parkingId);
      await tx.vehicle.updateMany({ where: { residentId: id }, data: { isActive: false } });

      // Lock the login only when this was the person's last active flat.
      if (existing.accountId) {
        const stillActive = await tx.resident.count({ where: { accountId: existing.accountId, isActive: true } });
        if (stillActive === 0) await tx.userAccount.update({ where: { id: existing.accountId }, data: { isActive: false } });
      }
    }
    return updated;
  });
  return ok(resident);
});

// Guarded delete: residents with vehicles, complaints or a login are deactivated instead.
export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  const resident = await prisma.resident.findUnique({ where: { id }, include: { _count: { select: { vehicles: true, complaints: true } } } });
  if (!resident) throw notFound("Resident");
  if (resident._count.vehicles + resident._count.complaints > 0 || resident.accountId !== null) {
    throw conflict("This resident has vehicles, complaints or a login. Deactivate the resident instead of deleting.");
  }
  await prisma.resident.delete({ where: { id } });
  return ok({ deleted: true });
});
