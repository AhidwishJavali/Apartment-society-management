import type { FilterQuery } from "mongoose";
import { badRequest, created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { feedbackBody, feedbackQuery } from "@/lib/schemas";
import { pageArgs, pageMeta } from "@/server/helpers";
import { withId } from "@/server/objectId";
import { Feedback, type FeedbackDoc } from "@/models";

export const GET = route(["ADMIN", "RESIDENT"], async ({ req, user }) => {
  const q = parseQuery(req, feedbackQuery);
  await connectMongo();

  const filter: FilterQuery<FeedbackDoc> = {};
  if (user.role === "RESIDENT") filter.residentId = user.residentId ?? -1;
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ message: rx }, { category: rx }];
  }

  const { skip, take } = pageArgs(q);
  const [docs, total] = await Promise.all([
    Feedback.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(take).lean(),
    Feedback.countDocuments(filter),
  ]);

  const residents = await prisma.resident.findMany({
    where: { id: { in: [...new Set(docs.map((d) => d.residentId))] } },
    select: { id: true, name: true, apartment: { select: { block: true, flatNo: true } } },
  });
  const byId = new Map(residents.map((r) => [r.id, r]));
  return ok(
    docs.map((d) => {
      const r = byId.get(d.residentId);
      return { ...withId(d), residentName: r?.name ?? `#${d.residentId}`, apartmentLabel: r ? `${r.apartment.block}-${r.apartment.flatNo}` : "" };
    }),
    pageMeta(q, total),
  );
});

export const POST = route(["RESIDENT"], async ({ req, user }) => {
  const body = await parseBody(req, feedbackBody);
  if (!user.residentId || !user.apartmentId) throw badRequest("Your account is not linked to a resident");
  await connectMongo();
  const doc = await Feedback.create({
    ...body,
    residentId: user.residentId, // from the session, never from the request
    apartmentId: user.apartmentId,
    submittedAt: new Date(),
    status: "NEW",
  });
  return created(withId(doc.toObject()));
});
