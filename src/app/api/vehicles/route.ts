import type { Prisma } from "@prisma/client";
import { badRequest, created, notFound, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vehicleBody, vehicleQuery } from "@/lib/schemas";
import { pageArgs, pageMeta, visibleResidentsWhere } from "@/server/helpers";
import { allocateSlot } from "@/server/parking";
import { vehicleInclude as include } from "@/server/includes";

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, vehicleQuery);
  const where: Prisma.VehicleWhereInput = {};
  // Residents see their own vehicles, plus every vehicle in flats they own.
  if (user.role === "RESIDENT") where.resident = visibleResidentsWhere(user);
  else if (q.residentId) where.residentId = q.residentId;
  if (q.active) where.isActive = q.active === "true";
  if (q.q) {
    const term = q.q.replace(/[\s-]+/g, "").toUpperCase();
    where.OR = [{ vehicleNumber: { contains: term } }, { brand: { contains: q.q } }];
  }
  const [rows, total] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy: { vehicleNumber: "asc" }, ...pageArgs(q), include }),
    prisma.vehicle.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, vehicleBody);
  if (!body.residentId) throw badRequest("residentId is required", { fieldErrors: { residentId: ["Required"] } });
  const resident = await prisma.resident.findUnique({ where: { id: body.residentId } });
  if (!resident || !resident.isActive) throw notFound("Active resident");

  const vehicle = await prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.create({
      data: {
        residentId: body.residentId!,
        vehicleNumber: body.vehicleNumber,
        vehicleType: body.vehicleType,
        brand: body.brand ?? null,
      },
    });
    if (body.parkingId) await allocateSlot(tx, body.parkingId, v.id);
    return tx.vehicle.findUniqueOrThrow({ where: { id: v.id }, include });
  });
  return created(vehicle);
});
