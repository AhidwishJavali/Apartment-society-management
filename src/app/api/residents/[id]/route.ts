import { conflict, forbidden, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { residentPatch } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const id = parseId(params.id);
  if (user.role === "RESIDENT" && user.residentId !== id) {
    const target = user.residentType === "OWNER" ? await prisma.resident.findUnique({ where: { id }, select: { apartmentId: true } }) : null;
    if (!target || target.apartmentId !== user.apartmentId) throw forbidden();
  }
  const resident = await prisma.resident.findUnique({
    where: { id },
    include: { apartment: true, vehicles: true },
  });
  if (!resident) throw notFound("Resident");
  return ok(resident);
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, residentPatch);
  const resident = await prisma.$transaction(async (tx) => {
    const updated = await tx.resident.update({ where: { id }, data: body });
    // Deactivating a resident must also lock their login.
    if (body.isActive === false) await tx.userAccount.updateMany({ where: { residentId: id }, data: { isActive: false } });
    return updated;
  });
  return ok(resident);
});

// Guarded delete: residents with vehicles, complaints or an account are deactivated instead.
export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  const [vehicles, complaints, accounts] = await Promise.all([
    prisma.vehicle.count({ where: { residentId: id } }),
    prisma.complaint.count({ where: { residentId: id } }),
    prisma.userAccount.count({ where: { residentId: id } }),
  ]);
  if (vehicles + complaints + accounts > 0) {
    throw conflict("This resident has vehicles, complaints or an account. Deactivate the resident instead of deleting.");
  }
  await prisma.resident.delete({ where: { id } });
  return ok({ deleted: true });
});
