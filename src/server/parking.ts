import type { Prisma } from "@prisma/client";
import { badRequest, conflict, notFound } from "@/lib/api";
import { isSlotCompatible } from "@/lib/rules";

type Tx = Prisma.TransactionClient;

/**
 * Allocates a slot to a vehicle inside the caller's transaction. The conditional updateMany on
 * `status: AVAILABLE` plus the unique Vehicle.parkingId column make double allocation impossible
 * even when two requests race.
 */
export async function allocateSlot(tx: Tx, slotId: number, vehicleId: number) {
  const [slot, vehicle] = await Promise.all([
    tx.parkingSpace.findUnique({ where: { id: slotId } }),
    tx.vehicle.findUnique({ where: { id: vehicleId }, include: { resident: true } }),
  ]);
  if (!slot) throw notFound("Parking slot");
  if (!vehicle) throw notFound("Vehicle");
  if (!vehicle.isActive) throw badRequest("Inactive vehicles cannot be allocated a slot");
  if (!vehicle.resident.isActive) throw badRequest("The vehicle's resident is inactive");
  if (vehicle.parkingId !== null) throw conflict("This vehicle already has a parking slot. Release it first.");
  if (!isSlotCompatible(vehicle.vehicleType, slot.vehicleType)) {
    throw badRequest(`A ${vehicle.vehicleType} cannot use a ${slot.vehicleType} slot`);
  }

  const claimed = await tx.parkingSpace.updateMany({
    where: { id: slotId, status: "AVAILABLE" },
    data: { status: "ALLOCATED", apartmentId: vehicle.resident.apartmentId },
  });
  if (claimed.count !== 1) throw conflict("This slot is not available");

  await tx.vehicle.update({ where: { id: vehicleId }, data: { parkingId: slotId } });
}

/** Frees a slot and detaches whichever vehicle held it, keeping both records consistent. */
export async function releaseSlot(tx: Tx, slotId: number) {
  const slot = await tx.parkingSpace.findUnique({ where: { id: slotId } });
  if (!slot) throw notFound("Parking slot");
  await tx.vehicle.updateMany({ where: { parkingId: slotId }, data: { parkingId: null } });
  await tx.parkingSpace.update({ where: { id: slotId }, data: { status: "AVAILABLE", apartmentId: null } });
}
