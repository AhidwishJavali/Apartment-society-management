import type { Prisma } from "@prisma/client";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { paginationQuery, residentBody } from "@/lib/schemas";
import { pageArgs, pageMeta } from "@/server/helpers";
import { z } from "zod";

const query = paginationQuery.extend({
  apartmentId: z.coerce.number().int().positive().optional(),
  residentType: z.enum(["OWNER", "TENANT"]).optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, query);
  const where: Prisma.ResidentWhereInput = {};
  if (user.role === "RESIDENT") {
    // Owners see everyone in their flat; tenants see only themselves.
    if (user.residentType === "OWNER") where.apartmentId = user.apartmentId ?? -1;
    else where.id = user.residentId ?? -1;
  }
  if (q.apartmentId && user.role === "ADMIN") where.apartmentId = q.apartmentId;
  if (q.residentType) where.residentType = q.residentType;
  if (q.active) where.isActive = q.active === "true";
  if (q.q) where.OR = [{ name: { contains: q.q } }, { email: { contains: q.q } }, { phone: { contains: q.q } }];

  const [rows, total] = await Promise.all([
    prisma.resident.findMany({
      where,
      orderBy: { name: "asc" },
      ...pageArgs(q),
      include: { apartment: { select: { block: true, flatNo: true } } },
    }),
    prisma.resident.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, residentBody);
  return created(await prisma.resident.create({ data: body }));
});
