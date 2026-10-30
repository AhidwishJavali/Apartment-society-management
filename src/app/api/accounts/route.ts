import { badRequest, created, notFound, ok, parseBody, parseQuery, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountBody, paginationQuery } from "@/lib/schemas";
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

  if (body.residentId) {
    const resident = await prisma.resident.findUnique({ where: { id: body.residentId } });
    if (!resident || !resident.isActive) throw notFound("Active resident");
  }
  if (body.staffId) {
    const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
    if (!staff || !staff.isActive) throw notFound("Active staff member");
    if (body.role === "SECURITY" && !/security/i.test(staff.role)) {
      throw badRequest("SECURITY accounts must link to a staff member whose role is Security", { fieldErrors: { staffId: ["Not a security role"] } });
    }
  }

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
