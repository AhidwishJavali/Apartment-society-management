import { badRequest, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validatePaymentState } from "@/lib/rules";
import { paymentPatch } from "@/lib/schemas";
import { assertApartmentAccess, toDateOnly } from "@/server/helpers";

type P = { id: string };

export const GET = route<P>(["ADMIN", "RESIDENT"], async ({ user, params }) => {
  const payment = await prisma.maintenancePayment.findUnique({
    where: { id: parseId(params.id) },
    include: { apartment: { select: { block: true, flatNo: true } } },
  });
  if (!payment) throw notFound("Payment");
  assertApartmentAccess(user, payment.apartmentId);
  return ok(payment);
});

// Covers edits and "mark paid": the merged result must still satisfy the PAID/PENDING date rule.
export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, paymentPatch);
  const existing = await prisma.maintenancePayment.findUnique({ where: { id } });
  if (!existing) throw notFound("Payment");

  const status = body.status ?? existing.status;
  let paymentDate: string | null | undefined = body.paymentDate;
  if (paymentDate === undefined) paymentDate = existing.paymentDate?.toISOString().slice(0, 10) ?? null;
  if (status === "PENDING" && body.status === "PENDING") paymentDate = null; // reverting to pending clears the date

  const problem = validatePaymentState({ status, paymentDate });
  if (problem) throw badRequest(problem, { fieldErrors: { paymentDate: [problem] } });

  const updated = await prisma.maintenancePayment.update({
    where: { id },
    data: {
      amount: body.amount,
      status,
      paymentDate: paymentDate ? toDateOnly(paymentDate) : null,
    },
  });
  return ok(updated);
});
