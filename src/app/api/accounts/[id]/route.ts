import { badRequest, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountPatch } from "@/lib/schemas";
import { assertLinkable, linkResidency } from "@/server/accounts";

type P = { id: string };

export const PATCH = route<P>(["ADMIN"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, accountPatch);
  if (id === user.id && body.isActive === false) throw badRequest("You cannot deactivate your own account");

  const account = await prisma.$transaction(async (tx) => {
    const existing = await tx.userAccount.findUnique({ where: { id }, include: { residencies: { select: { id: true, isActive: true } } } });
    if (!existing) throw notFound("Account");

    // Extra flats for a person who owns or rents more than one.
    if (body.linkResidentId) {
      if (existing.role !== "RESIDENT") throw badRequest("Only RESIDENT accounts can be linked to flats");
      await assertLinkable(tx, "RESIDENT", body.linkResidentId, null, id);
      await linkResidency(tx, id, body.linkResidentId);
    }
    if (body.unlinkResidentId) {
      const linked = existing.residencies.find((r) => r.id === body.unlinkResidentId);
      if (!linked) throw badRequest("That resident is not linked to this account");
      const othersActive = existing.residencies.filter((r) => r.id !== linked.id && r.isActive).length;
      if (othersActive === 0) throw badRequest("This is the account's last active flat. Deactivate the account instead.");
      await tx.resident.update({ where: { id: linked.id }, data: { accountId: null } });
    }

    return tx.userAccount.update({
      where: { id },
      data: {
        isActive: body.isActive,
        // A new password also signs the person out everywhere, so an old session cannot outlive it.
        ...(body.password ? { passwordHash: await hashPassword(body.password), sessionsValidAfter: new Date() } : {}),
      },
      select: { id: true, username: true, role: true, isActive: true },
    });
  });
  return ok(account);
});
