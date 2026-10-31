import { conflict, notFound, ok, parseBody, parseId, partial, route } from "@/lib/api";
import { ACTIVITY_WARNING, appendActivity } from "@/server/helpers";
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

export const PATCH = route<P>(["ADMIN"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, staffPatch);
  const { staff, returned } = await prisma.$transaction(async (tx) => {
    const existing = await tx.staff.findUnique({ where: { id } });
    if (!existing) throw notFound("Staff member");
    const updated = await tx.staff.update({ where: { id }, data: body });
    let returned: number[] = [];
    if (body.isActive === false && existing.isActive) {
      await tx.userAccount.updateMany({ where: { staffId: id }, data: { isActive: false } });
      // Work in progress would be stuck with someone who can no longer sign in: put it back in the queue.
      const open = await tx.complaint.findMany({ where: { staffId: id, status: "IN_PROGRESS" }, select: { id: true } });
      returned = open.map((c) => c.id);
      if (returned.length) await tx.complaint.updateMany({ where: { id: { in: returned } }, data: { staffId: null, status: "OPEN" } });
    }
    return { staff: updated, returned };
  });
  const logs = await Promise.all(
    returned.map((complaintId) =>
      appendActivity({ complaintId, user, action: "STATUS_CHANGED", oldStatus: "IN_PROGRESS", newStatus: "OPEN", note: `Unassigned: ${staff.name} was deactivated` }),
    ),
  );
  const result = { ...staff, unassignedComplaints: returned.length };
  return logs.every((l) => l.ok) ? ok(result) : partial(result, ACTIVITY_WARNING);
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
