import type { Prisma } from "@prisma/client";
import { ok, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { accountRequestQuery } from "@/lib/schemas";
import { requestSelect } from "@/server/accounts";
import { pageArgs, pageMeta } from "@/server/helpers";

export const GET = route(["ADMIN"], async ({ req }) => {
  const q = parseQuery(req, accountRequestQuery);
  const where: Prisma.AccountRequestWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.q) where.OR = [{ fullName: { contains: q.q } }, { username: { contains: q.q } }, { email: { contains: q.q } }];
  const [rows, total] = await Promise.all([
    prisma.accountRequest.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q), select: requestSelect }),
    prisma.accountRequest.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});
