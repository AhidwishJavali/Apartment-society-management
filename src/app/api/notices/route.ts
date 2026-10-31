import type { FilterQuery } from "mongoose";
import { created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { visibleAudiences } from "@/lib/rules";
import { noticeBody, noticeQuery } from "@/lib/schemas";
import { pageArgs, pageMeta, toDateOnly } from "@/server/helpers";
import { withId } from "@/server/objectId";
import { Notice, type NoticeDoc } from "@/models";

// ADMIN: every notice incl. drafts/archived. Everyone else: published, unexpired, for their audience.
export const GET = route("ANY", async ({ req, user }) => {
  const q = parseQuery(req, noticeQuery);
  await connectMongo();

  const filter: FilterQuery<NoticeDoc> = {};
  const audiences = visibleAudiences(user.role, user.residencies.map((r) => r.residentType));
  if (audiences === "ALL_AUDIENCES") {
    if (q.status) filter.status = q.status;
    if (q.audience) filter.audience = q.audience;
  } else {
    filter.status = "PUBLISHED";
    filter.audience = q.audience && audiences.includes(q.audience) ? q.audience : { $in: audiences };
    filter.$and = [{ $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }];
  }
  if (q.q) {
    const rx = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: rx }, { body: rx }];
  }
  if (q.from || q.to) {
    filter.createdAt = {
      ...(q.from ? { $gte: toDateOnly(q.from) } : {}),
      ...(q.to ? { $lt: new Date(toDateOnly(q.to).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }

  const { skip, take } = pageArgs(q);
  const [docs, total] = await Promise.all([
    Notice.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(take).lean(),
    Notice.countDocuments(filter),
  ]);
  return ok(docs.map(withId), pageMeta(q, total));
});

export const POST = route(["ADMIN"], async ({ req, user }) => {
  const { publish, expiresAt, ...body } = await parseBody(req, noticeBody);
  await connectMongo();
  const notice = await Notice.create({
    ...body,
    expiresAt: expiresAt ?? undefined,
    status: publish ? "PUBLISHED" : "DRAFT",
    publishedAt: publish ? new Date() : undefined,
    createdByUserId: user.id,
  });
  return created(withId(notice.toObject()));
});
