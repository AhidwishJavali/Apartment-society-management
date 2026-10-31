import { badRequest, conflict, notFound, ok, parseBody, parseId, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { accountRequestPatch } from "@/lib/schemas";
import { assertLinkable, linkResidency, requestSelect } from "@/server/accounts";

type P = { id: string };

export const PATCH = route<P>(["ADMIN"], async ({ req, user, params }) => {
  const id = parseId(params.id);
  const body = await parseBody(req, accountRequestPatch);

  await prisma.$transaction(async (tx) => {
    const request = await tx.accountRequest.findUnique({ where: { id } });
    if (!request) throw notFound("Request");
    if (request.status !== "PENDING") throw conflict(`This request was already ${request.status.toLowerCase()}`);

    // Claim the request first: of two concurrent reviews only one gets count === 1.
    const claimed = await tx.accountRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: body.action === "approve" ? "APPROVED" : "REJECTED",
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        reviewNote: body.note ?? null,
      },
    });
    if (claimed.count !== 1) throw conflict("This request was just reviewed by someone else");
    if (body.action === "reject") return;

    const clash = await tx.userAccount.findFirst({ where: { OR: [{ username: request.username }, { email: request.email }] }, select: { id: true } });
    if (clash) throw badRequest("An account with this username or email already exists. Reject the request instead.");
    await assertLinkable(tx, body.role, body.residentId, body.staffId);

    const account = await tx.userAccount.create({
      data: {
        username: request.username,
        email: request.email,
        passwordHash: request.passwordHash, // the requester's own password, already hashed
        role: body.role,
        staffId: body.staffId ?? null,
      },
    });
    if (body.residentId) await linkResidency(tx, account.id, body.residentId);
    await tx.accountRequest.update({ where: { id }, data: { createdAccountId: account.id } });
  });

  return ok(await prisma.accountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
});
