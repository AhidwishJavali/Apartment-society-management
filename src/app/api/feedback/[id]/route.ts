import { notFound, ok, parseBody, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { feedbackPatch } from "@/lib/schemas";
import { Feedback } from "@/models";
import { parseObjectId, withId } from "@/server/objectId";

type P = { id: string };

export const PATCH = route<P>(["ADMIN"], async ({ req, params }) => {
  const id = parseObjectId(params.id);
  const body = await parseBody(req, feedbackPatch);
  await connectMongo();
  const updated = await Feedback.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();
  if (!updated) throw notFound("Feedback");
  return ok(withId(updated as { _id: unknown }));
});
