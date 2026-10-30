import type { FilterQuery } from "mongoose";
import { badRequest, created, ok, parseBody, parseQuery, route } from "@/lib/api";
import { connectMongo } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { visitorBody, visitorQuery } from "@/lib/schemas";
import { pageArgs, pageMeta, toDateOnly } from "@/server/helpers";
import { withId } from "@/server/objectId";
import { Visitor, type VisitorDoc } from "@/models";

export const GET = route(["ADMIN", "SECURITY"], async ({ req }) => {
  const q = parseQuery(req, visitorQuery);
  await connectMongo();

  const filter: FilterQuery<VisitorDoc> = {};
  if (q.apartmentId) filter.apartmentId = q.apartmentId;
  if (q.status) filter.status = q.status;
  if (q.q) filter.visitorName = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (q.from || q.to) {
    filter.entryTime = {
      ...(q.from ? { $gte: toDateOnly(q.from) } : {}),
      ...(q.to ? { $lt: new Date(toDateOnly(q.to).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }

  const { skip, take } = pageArgs(q);
  const [docs, total] = await Promise.all([
    Visitor.find(filter).sort({ entryTime: -1 }).skip(skip).limit(take).lean(),
    Visitor.countDocuments(filter),
  ]);

  // Mongo stores only apartment ids; resolve flat labels from MySQL for display.
  const apartments = await prisma.apartment.findMany({
    where: { id: { in: [...new Set(docs.map((d) => d.apartmentId))] } },
    select: { id: true, block: true, flatNo: true },
  });
  const label = new Map(apartments.map((a) => [a.id, `${a.block}-${a.flatNo}`]));
  return ok(docs.map((d) => ({ ...withId(d), apartmentLabel: label.get(d.apartmentId) ?? `#${d.apartmentId}` })), pageMeta(q, total));
});

export const POST = route(["ADMIN", "SECURITY"], async ({ req, user }) => {
  const body = await parseBody(req, visitorBody);
  const apartment = await prisma.apartment.findUnique({ where: { id: body.apartmentId } });
  if (!apartment) throw badRequest("Destination apartment does not exist", { fieldErrors: { apartmentId: ["Unknown apartment"] } });
  if (body.hostResidentId) {
    const host = await prisma.resident.findUnique({ where: { id: body.hostResidentId } });
    if (!host || host.apartmentId !== body.apartmentId) {
      throw badRequest("Host resident does not live in that apartment", { fieldErrors: { hostResidentId: ["Not in this apartment"] } });
    }
  }

  await connectMongo();
  const visitor = await Visitor.create({
    ...body,
    entryTime: new Date(),
    status: "INSIDE",
    recordedByUserId: user.id, // from the session, never from the request
  });
  return created({ ...withId(visitor.toObject()), apartmentLabel: `${apartment.block}-${apartment.flatNo}` });
});
