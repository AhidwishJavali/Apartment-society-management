import type { Prisma } from "@prisma/client";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { apartmentBody, paginationQuery } from "@/lib/schemas";
import { pageArgs, pageMeta } from "@/server/helpers";

// ADMIN: all flats. RESIDENT: their own flat only. SECURITY: read-only list (to pick a destination).
export const GET = route(["ADMIN", "RESIDENT", "SECURITY"], async ({ req, user }) => {
  const query = parseQuery(req, paginationQuery);
  const where: Prisma.ApartmentWhereInput = {};
  if (user.role === "RESIDENT") where.id = { in: user.apartmentIds };
  if (query.q) {
    where.OR = [{ block: { contains: query.q } }, { flatNo: { contains: query.q } }];
  }
  const [rows, total] = await Promise.all([
    prisma.apartment.findMany({
      where,
      orderBy: [{ block: "asc" }, { flatNo: "asc" }],
      ...pageArgs(query),
      include: { _count: { select: { residents: true } } },
    }),
    prisma.apartment.count({ where }),
  ]);
  return ok(rows, pageMeta(query, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, apartmentBody);
  return created(await prisma.apartment.create({ data: body }));
});
