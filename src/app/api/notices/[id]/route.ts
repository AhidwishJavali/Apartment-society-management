import { badRequest, notFound, ok, parseBody, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { noticePatch } from "@/lib/schemas";
import { Notice } from "@/models";
import { parseObjectId, withId } from "@/server/objectId";

type P = { id: string };

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseObjectId(params.id);
  const { action, expiresAt, ...fields } = await parseBody(req, noticePatch);
  await connectMongo();

  const notice = await Notice.findById(id);
  if (!notice) throw notFound("Notice");

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) notice.set(key, value);
  });
  if (expiresAt !== undefined) notice.set("expiresAt", expiresAt ?? undefined);

  if (action === "publish") {
    if (notice.status === "ARCHIVED") throw badRequest("Archived notices cannot be published again");
    if (notice.status !== "PUBLISHED") {
      notice.status = "PUBLISHED";
      notice.publishedAt = new Date();
    }
  }
  if (action === "archive") notice.status = "ARCHIVED";

  await notice.save();
  return ok(withId(notice.toObject()));
});
