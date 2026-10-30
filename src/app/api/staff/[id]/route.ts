import { conflict, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { staffPatch } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>(["ADMIN"], async ({ params }) => {
  const staff = await prisma.staff.findUnique({
    where: { id: parseId(params.id) },
    include: { _count: { select: { complaints: true } } },
  });
  if (!staff) throw notFound("Staff member");
  return ok(staff);
});

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, staffPatch);
  const staff = await prisma.$transaction(async (tx) => {
    const updated = await tx.staff.update({ where: { id }, data: body });
    if (body.isActive === false) await tx.userAccount.updateMany({ where: { staffId: id }, data: { isActive: false } });
    return updated;
  });
  return ok(staff);
});

export const DELETE = route<P>(["ADMIN"], async ({ params }) => {
  const id = parseId(params.id);
  const [complaints, accounts] = await Promise.all([
    prisma.complaint.count({ where: { staffId: id } }),
    prisma.userAccount.count({ where: { staffId: id } }),
  ]);
  if (complaints + accounts > 0) {
    throw conflict("This staff member has complaint history or an account. Deactivate instead of deleting.");
  }
  await prisma.staff.delete({ where: { id } });
  return ok({ deleted: true });
});
