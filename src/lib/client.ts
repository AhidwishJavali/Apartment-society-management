export type Meta = { page: number; pageSize: number; total: number; totalPages: number };
export type Option = { value: string | number; label: string; meta?: Record<string, unknown> };

export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export type ApiResult<T> = { data: T; meta?: Meta; warning?: string };

/** Browser-side fetch wrapper for the shared `{ data, meta } | { error }` envelope. */
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ClientError("Network error - check your connection and try again", 0);
  }

  let body: { data?: T; meta?: Meta; error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[]> } } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error pages fall through to the generic message */
  }

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
    window.location.href = "/login";
  }
  // 207 = MySQL committed but the MongoDB audit write failed; surface it as a warning.
  if (res.ok) return { data: body.data as T, meta: body.meta, warning: res.status === 207 ? body.error?.message : undefined };

  throw new ClientError(
    body.error?.message ?? `Request failed (${res.status})`,
    res.status,
    body.error?.code,
    body.error?.details?.fieldErrors ?? {},
  );
}

export const money = (value: unknown) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const dateOnly = (value?: string | null) => (value ? value.slice(0, 10) : "—");

/** Stored in UTC; shown in the viewer's local time zone. */
export const dateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");
