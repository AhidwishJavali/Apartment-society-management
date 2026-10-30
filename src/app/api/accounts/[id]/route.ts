import { badRequest, ok, parseBody, parseId, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountPatch } from "@/lib/schemas";

type P = { id: string };

export const PATCH = route<P>(["ADMIN"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, accountPatch);
  if (id === user.id && body.isActive === false) throw badRequest("You cannot deactivate your own account");

  const account = await prisma.userAccount.update({
    where: { id },
    data: {
      isActive: body.isActive,
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
    },
    select: { id: true, username: true, role: true, isActive: true },
  });
  return ok(account);
});
