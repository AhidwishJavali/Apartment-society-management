import { badRequest, forbidden, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isSlotCompatible } from "@/lib/rules";
import { vehiclePatch } from "@/lib/schemas";
import { allocateSlot, releaseSlot } from "@/server/parking";
import { vehicleInclude as include } from "@/server/includes";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: parseId(params.id) },
    include: { ...include, resident: { select: { id: true, name: true, apartmentId: true, apartment: { select: { block: true, flatNo: true } } } } },
  });
  if (!vehicle) throw notFound("Vehicle");
  if (user.role === "RESIDENT" && !user.residentIds.includes(vehicle.resident.id) && !user.ownedApartmentIds.includes(vehicle.resident.apartmentId)) {
    throw forbidden();
  }
  return ok(vehicle);
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, vehiclePatch);

  const vehicle = await prisma.$transaction(async (tx) => {
    const existing = await tx.vehicle.findUnique({ where: { id }, include: { parking: true, resident: true } });
    if (!existing) throw notFound("Vehicle");
    if (body.isActive === true && !existing.resident.isActive) throw badRequest("The vehicle's resident is inactive");

    const nextType = body.vehicleType ?? existing.vehicleType;
    if (existing.parking && !isSlotCompatible(nextType, existing.parking.vehicleType)) {
      throw badRequest("Release the parking slot before changing the vehicle type");
    }

    if (body.isActive === false && existing.parkingId) await releaseSlot(tx, existing.parkingId);
    if (body.parkingId === null && existing.parkingId) await releaseSlot(tx, existing.parkingId);

    await tx.vehicle.update({
      where: { id },
      // brand: null clears it, undefined leaves it unchanged.
      data: { vehicleNumber: body.vehicleNumber, vehicleType: body.vehicleType, brand: body.brand, isActive: body.isActive },
    });

    if (typeof body.parkingId === "number") {
      if (existing.parkingId && existing.parkingId !== body.parkingId) await releaseSlot(tx, existing.parkingId);
      if (existing.parkingId !== body.parkingId) await allocateSlot(tx, body.parkingId, id);
    }
    return tx.vehicle.findUniqueOrThrow({ where: { id }, include });
  });
  return ok(vehicle);
});

// Vehicles are deactivated, never hard-deleted; the slot is released in the same transaction.
export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw notFound("Vehicle");
    if (vehicle.parkingId) await releaseSlot(tx, vehicle.parkingId);
    await tx.vehicle.update({ where: { id }, data: { isActive: false } });
  });
  return ok({ deactivated: true });
});
