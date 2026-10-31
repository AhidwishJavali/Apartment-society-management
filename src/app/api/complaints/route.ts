import type { Prisma } from "@prisma/client";
import { badRequest, created, notFound, parseBody, parseQuery, partial, ok, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { complaintBody, complaintQuery } from "@/lib/schemas";
import { ACTIVITY_WARNING, appendActivity, pageArgs, pageMeta, pickResidency } from "@/server/helpers";
import { complaintInclude } from "@/server/includes";

// ADMIN sees everything, RESIDENT their own, MAINTENANCE only complaints assigned to them.
export const GET = route(["ADMIN", "RESIDENT", "MAINTENANCE"], async ({ req, user }) => {
  const q = parseQuery(req, complaintQuery);
  const where: Prisma.ComplaintWhereInput = {};
  if (user.role === "RESIDENT") where.residentId = { in: user.residentIds };
  else if (user.role === "MAINTENANCE") where.staffId = user.staffId ?? -1;
  else if (q.staffId) where.staffId = q.staffId;
  if (q.status) where.status = q.status;
  if (q.category) where.category = q.category;
  if (q.q) where.OR = [{ description: { contains: q.q } }, { category: { contains: q.q } }];

  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      orderBy: [{ complaintDate: "desc" }, { id: "desc" }],
      ...pageArgs(q),
      include: complaintInclude,
    }),
    prisma.complaint.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const body = await parseBody(req, complaintBody);
  // Residents always file as themselves: a residentId they send must be one of their own flats.
  const residentId = user.role === "RESIDENT" ? pickResidency(user, body.residentId).residentId : body.residentId;
  if (!residentId) throw badRequest("residentId is required", { fieldErrors: { residentId: ["Required"] } });
  const resident = await prisma.resident.findUnique({ where: { id: residentId } });
  if (!resident || !resident.isActive) throw notFound("Active resident");

  const complaint = await prisma.complaint.create({
    data: {
      residentId,
      category: body.category,
      description: body.description,
      complaintDate: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
      status: "OPEN",
    },
    include: complaintInclude,
  });

  const logged = await appendActivity({ complaintId: complaint.id, user, action: "CREATED", newStatus: "OPEN", note: body.description });
  return logged.ok ? created(complaint) : { ...partial(complaint, ACTIVITY_WARNING), status: 207 };
});
