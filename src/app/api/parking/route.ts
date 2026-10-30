import type { Prisma } from "@prisma/client";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parkingBody, parkingQuery } from "@/lib/schemas";
import { allocateSlot } from "@/server/parking";
import { pageArgs, pageMeta } from "@/server/helpers";

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, parkingQuery);
  const where: Prisma.ParkingSpaceWhereInput = {};
  if (user.role === "RESIDENT") where.apartmentId = user.apartmentId ?? -1;
  if (q.status) where.status = q.status;
  if (q.vehicleType) where.vehicleType = q.vehicleType;
  if (q.q) where.slotNumber = { contains: q.q };

  const [rows, total] = await Promise.all([
    prisma.parkingSpace.findMany({
      where,
      orderBy: { slotNumber: "asc" },
      ...pageArgs(q),
      include: {
        apartment: { select: { block: true, flatNo: true } },
        vehicle: { select: { id: true, vehicleNumber: true, vehicleType: true } },
      },
    }),
    prisma.parkingSpace.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

// Creates an AVAILABLE slot, or allocates it straight away when vehicleId is supplied.
export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, parkingBody);
  const slot = await prisma.$transaction(async (tx) => {
    const slot = await tx.parkingSpace.create({
      data: { slotNumber: body.slotNumber, vehicleType: body.vehicleType, status: "AVAILABLE" },
    });
    if (body.vehicleId) await allocateSlot(tx, slot.id, body.vehicleId);
    return tx.parkingSpace.findUniqueOrThrow({ where: { id: slot.id } });
  });
  return created(slot);
});
