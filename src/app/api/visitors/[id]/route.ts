import { z } from "zod";
import { conflict, notFound, ok, parseBody, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { Visitor } from "@/models";
import { parseObjectId, withId } from "@/server/objectId";

type P = { id: string };

const exitBody = z.object({ action: z.literal("exit") });

// Records the exit on the matching active visit only; a second exit is rejected.
export const PATCH = route<P>(["ADMIN", "SECURITY"], async ({ req, params }) => {
  const id = parseObjectId(params.id);
  await parseBody(req, exitBody);
  await connectMongo();

  const updated = await Visitor.findOneAndUpdate(
    { _id: id, status: "INSIDE" },
    { $set: { status: "EXITED", exitTime: new Date() } },
    { new: true },
  ).lean();
  if (updated) return ok(withId(updated as { _id: unknown }));

  const existing = await Visitor.exists({ _id: id });
  if (!existing) throw notFound("Visit");
  throw conflict("This visitor has already exited");
});
