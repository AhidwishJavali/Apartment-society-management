import type { Prisma } from "@prisma/client";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { paginationQuery, residentBody } from "@/lib/schemas";
import { pageArgs, pageMeta, visibleResidentsWhere } from "@/server/helpers";
import { z } from "zod";

const query = paginationQuery.extend({
  apartmentId: z.coerce.number().int().positive().optional(),
  residentType: z.enum(["OWNER", "TENANT"]).optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, query);
  const where: Prisma.ResidentWhereInput = {};
  // Residents see their own rows, plus everyone in flats they own (the household).
  if (user.role === "RESIDENT") where.AND = [visibleResidentsWhere(user)];
  if (q.apartmentId && user.role === "ADMIN") where.apartmentId = q.apartmentId;
  if (q.residentType) where.residentType = q.residentType;
  if (q.active) where.isActive = q.active === "true";
  if (q.q) where.OR = [{ name: { contains: q.q } }, { email: { contains: q.q } }, { phone: { contains: q.q } }];

  const [rows, total] = await Promise.all([
    prisma.resident.findMany({
      where,
      orderBy: { name: "asc" },
      ...pageArgs(q),
      include: {
        apartment: { select: { block: true, flatNo: true } },
        account: user.role === "ADMIN" ? { select: { id: true, username: true } } : false,
      },
    }),
    prisma.resident.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, residentBody);
  return created(await prisma.resident.create({ data: body }));
});
