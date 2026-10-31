import type { Prisma } from "@prisma/client";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { paymentBody, paymentQuery } from "@/lib/schemas";
import { assertBillingAccess, pageArgs, pageMeta, toDateOnly } from "@/server/helpers";

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  assertBillingAccess(user);
  const q = parseQuery(req, paymentQuery);
  const where: Prisma.MaintenancePaymentWhereInput = {};
  if (user.role === "RESIDENT") where.apartmentId = user.apartmentId ?? -1;
  else if (q.apartmentId) where.apartmentId = q.apartmentId;
  if (q.status) where.status = q.status;
  if (q.month) where.paymentMonth = q.month;
  if (q.q) {
    where.apartment = { OR: [{ block: { contains: q.q } }, { flatNo: { contains: q.q } }] };
  }
  const [rows, total] = await Promise.all([
    prisma.maintenancePayment.findMany({
      where,
      orderBy: [{ paymentMonth: "desc" }, { apartmentId: "asc" }],
      ...pageArgs(q),
      include: { apartment: { select: { block: true, flatNo: true } } },
    }),
    prisma.maintenancePayment.count({ where }),
  ]);
  return ok(rows, pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req }) => {
  const body = await parseBody(req, paymentBody);
  // The unique (apartmentId, paymentMonth) index rejects duplicate monthly bills with a 409.
  const payment = await prisma.maintenancePayment.create({
    data: {
      apartmentId: body.apartmentId,
      amount: body.amount,
      paymentMonth: body.paymentMonth,
      status: body.status,
      paymentDate: body.paymentDate ? toDateOnly(body.paymentDate) : null,
    },
  });
  return created(payment);
});
