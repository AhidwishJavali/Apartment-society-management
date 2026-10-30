import { route, ok } from "@/lib/api";

export const GET = route("ANY", async ({ user }) => ok(user));
