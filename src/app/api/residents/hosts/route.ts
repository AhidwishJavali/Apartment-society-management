import { z } from "zod";
import { ok, parseQuery, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const query = z.object({ apartmentId: z.coerce.number().int().positive() });

// Minimal id + name list so security can pick the host resident when registering a visitor.
export const GET = route(["ADMIN", "SECURITY"], async ({ req }) => {
  const { apartmentId } = parseQuery(req, query);
  const residents = await prisma.resident.findMany({
    where: { apartmentId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return ok(residents);
});
