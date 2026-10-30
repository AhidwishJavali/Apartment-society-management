import { badRequest, conflict, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parkingPatch } from "@/lib/schemas";
import { assertApartmentAccess } from "@/server/helpers";
import { allocateSlot, releaseSlot } from "@/server/parking";

type P = { id: string };

const include = {
  apartment: { select: { block: true, flatNo: true } },
  vehicle: { select: { id: true, vehicleNumber: true, vehicleType: true } },
} as const;

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const slot = await prisma.parkingSpace.findUnique({ where: { id: parseId(params.id) }, include });
  if (!slot) throw notFound("Parking slot");
  assertApartmentAccess(user, slot.apartmentId);
  return ok(slot);
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, parkingPatch);

  await prisma.$transaction(async (tx) => {
    if (body.action === "allocate") return allocateSlot(tx, id, body.vehicleId);
    if (body.action === "release") return releaseSlot(tx, id);

    const slot = await tx.parkingSpace.findUnique({ where: { id } });
    if (!slot) throw notFound("Parking slot");
    if (body.vehicleType && body.vehicleType !== slot.vehicleType && slot.status === "ALLOCATED") {
      throw badRequest("Release the slot before changing its vehicle type");
    }
    await tx.parkingSpace.update({ where: { id }, data: { slotNumber: body.slotNumber, vehicleType: body.vehicleType } });
  });

  return ok(await prisma.parkingSpace.findUniqueOrThrow({ where: { id }, include }));
});

export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  const slot = await prisma.parkingSpace.findUnique({ where: { id } });
  if (!slot) throw notFound("Parking slot");
  if (slot.status === "ALLOCATED") throw conflict("Release the slot before deleting it");
  await prisma.parkingSpace.delete({ where: { id } });
  return ok({ deleted: true });
});
