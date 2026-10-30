import { badRequest, conflict, forbidden, ok, parseBody, parseId, partial, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canTransitionComplaint } from "@/lib/rules";
import { complaintPatch } from "@/lib/schemas";
import { ACTIVITY_WARNING, appendActivity } from "@/server/helpers";
import { loadComplaintFor, loadTimeline } from "@/server/complaints";
import { complaintInclude } from "@/server/includes";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT", "MAINTENANCE"], async ({ user, params }) => {
  const complaint = await loadComplaintFor(user, parseId(params.id));
  return ok({ ...complaint, ...(await loadTimeline(complaint.id)) });
});

export const PATCH = route<P>(["ADMIN", "MAINTENANCE"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, complaintPatch);
  const complaint = await loadComplaintFor(user, id);

  if (body.action === "assign") {
    if (user.role !== "ADMIN") throw forbidden("Only administrators can assign complaints");
    if (complaint.status === "RESOLVED") throw badRequest("Reopen the complaint before reassigning it");
    const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
    if (!staff || !staff.isActive) throw badRequest("Selected staff member is not available", { fieldErrors: { staffId: ["Not available"] } });

    // Guarded update: a concurrent status change makes this fail instead of overwriting it.
    const result = await prisma.complaint.updateMany({
      where: { id, status: complaint.status },
      data: { staffId: body.staffId, status: "IN_PROGRESS" },
    });
    if (result.count !== 1) throw conflict("The complaint changed while you were editing it. Reload and try again.");

    const updated = await prisma.complaint.findUniqueOrThrow({ where: { id }, include: complaintInclude });
    const logged = await appendActivity({
      complaintId: id,
      user,
      action: "ASSIGNED",
      oldStatus: complaint.status,
      newStatus: "IN_PROGRESS",
      note: [`Assigned to ${staff.name} (${staff.role})`, body.note].filter(Boolean).join(". "),
    });
    return logged.ok ? ok(updated) : partial(updated, ACTIVITY_WARNING);
  }

  // Status change
  if (body.status === complaint.status) throw badRequest("The complaint already has this status");
  if (!canTransitionComplaint(user.role, complaint.status, body.status)) {
    throw badRequest(`Changing status from ${complaint.status} to ${body.status} is not allowed for your role`);
  }
  if (complaint.staffId === null) throw badRequest("Assign a staff member before changing the status");

  const result = await prisma.complaint.updateMany({ where: { id, status: complaint.status }, data: { status: body.status } });
  if (result.count !== 1) throw conflict("The complaint changed while you were editing it. Reload and try again.");

  const updated = await prisma.complaint.findUniqueOrThrow({ where: { id }, include: complaintInclude });
  const logged = await appendActivity({
    complaintId: id,
    user,
    action: "STATUS_CHANGED",
    oldStatus: complaint.status,
    newStatus: body.status,
    note: body.note,
  });
  return logged.ok ? ok(updated) : partial(updated, ACTIVITY_WARNING);
});
