import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { paginationQuery, staffBody } from "@/lib/schemas";
import { pageArgs, pageMeta } from "@/server/helpers";

const query = paginationQuery.extend({
  role: z.string().trim().max(50).optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const GET = route(["ADMIN"], async ({ req }) => {
  const q = parseQuery(req, query);
  const where: Prisma.StaffWhereInput = {};
  if (q.role) where.role = q.role;
  if (q.active) where.isActive = q.active === "true";
  if (q.q) where.OR = [{ name: { contains: q.q } }, { role: { contains: q.q } }, { phone: { contains: q.q } }];
  const [rows, total] = await Promise.all([
    prisma.staff.findMany({ where, orderBy: { name: "asc" }, ...pageArgs(q) }),
    prisma.staff.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, staffBody);
  return created(await prisma.staff.create({ data: body }));
});
