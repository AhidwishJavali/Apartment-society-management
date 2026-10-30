import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";
import type { Role } from "./rules";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details);
export const forbidden = (message = "You do not have permission to perform this action") => new ApiError(403, "FORBIDDEN", message);
export const notFound = (what = "Record") => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

type Payload = { status: number; body: Record<string, unknown> };

export const ok = (data: unknown, meta?: Record<string, unknown>): Payload => ({ status: 200, body: { data, ...(meta ? { meta } : {}) } });
export const created = (data: unknown): Payload => ({ status: 201, body: { data } });

/** MySQL write succeeded but the MongoDB audit write did not: surface it, never claim full success. */
export const partial = (data: unknown, warning: string): Payload => ({
  status: 207,
  body: { data, error: { code: "PARTIAL_FAILURE", message: warning } },
});

type Handler<P> = (ctx: { req: NextRequest; user: CurrentUser; params: P }) => Promise<Payload>;
type RouteContext<P> = { params: Promise<P> };

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: err.flatten() } },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "value";
      const field = Array.isArray(target) ? target.join(", ") : String(target);
      return NextResponse.json({ error: { code: "CONFLICT", message: `A record with this ${field} already exists` } }, { status: 409 });
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Referenced record does not exist or is still in use" } },
        { status: 409 },
      );
    }
    if (err.code === "P2025") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
  }
  // Log the class only: connection strings and query text must not reach logs or the browser.
  console.error("Unhandled API error:", err instanceof Error ? err.name : "unknown");
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong on the server" } }, { status: 500 });
}

/**
 * Wraps a route handler with authentication, role check, same-origin check for mutations,
 * and the shared JSON envelope: `{ data, meta? }` on success, `{ error: { code, message } }` otherwise.
 * Record-ownership checks remain the handler's job (see src/server/scope.ts).
 */
export function route<P = Record<string, never>>(roles: Role[] | "ANY", handler: Handler<P>) {
  return async (req: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.get("origin");
        if (origin && new URL(origin).host !== req.headers.get("host")) throw forbidden("Cross-origin request rejected");
      }
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
      if (roles !== "ANY" && !roles.includes(user.role)) throw forbidden();
      const params = await context.params;
      const result = await handler({ req, user, params });
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Unauthenticated variant for login. */
export function publicRoute(handler: (req: NextRequest) => Promise<Payload | NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const result = await handler(req);
      return result instanceof NextResponse ? result : NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function parseId(value: string, label = "id"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Invalid ${label}`);
  return id;
}
