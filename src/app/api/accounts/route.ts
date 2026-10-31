import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountBody, paginationQuery } from "@/lib/schemas";
import { assertLinkable } from "@/server/accounts";
import { pageArgs, pageMeta } from "@/server/helpers";

const select = {
  id: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  resident: { select: { id: true, name: true } },
  staff: { select: { id: true, name: true } },
} as const; // passwordHash is never selected

export const GET = route(["ADMIN"], async ({ req }) => {
  const q = parseQuery(req, paginationQuery);
  const where = q.q ? { OR: [{ username: { contains: q.q } }, { email: { contains: q.q } }] } : {};
  const [rows, total] = await Promise.all([
    prisma.userAccount.findMany({ where, orderBy: { username: "asc" }, ...pageArgs(q), select }),
    prisma.userAccount.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, accountBody);

  await assertLinkable(prisma, body.role, body.residentId, body.staffId);

  const account = await prisma.userAccount.create({
    data: {
      username: body.username,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      residentId: body.residentId ?? null,
      staffId: body.staffId ?? null,
    },
    select,
  });
  return created(account);
});
