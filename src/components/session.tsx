"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Option } from "@/lib/client";
import type { Role } from "@/lib/rules";
import { Spinner } from "./ui";

export type SessionUser = {
  id: number;
  username: string;
  role: Role;
  residentId: number | null;
  staffId: number | null;
  apartmentId: number | null;
  displayName: string;
};

const SessionContext = createContext<SessionUser | null>(null);

export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside SessionProvider");
  return user;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    api<SessionUser>("/api/auth/session")
      .then((r) => setUser(r.data))
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);
  if (!user) return <Spinner label="Checking your session…" />;
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Loads select options from a list endpoint, following every page (up to 25 pages of 200). */
export function useOptions(endpoint: string | null, toOption: (row: Record<string, unknown>) => Option): Option[] {
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    (async () => {
      const rows: Record<string, unknown>[] = [];
      let totalPages = 1;
      for (let page = 1; page <= Math.min(totalPages, 25); page++) {
        const r = await api<Record<string, unknown>[]>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}pageSize=200&page=${page}`);
        rows.push(...r.data);
        totalPages = Number((r.meta as { totalPages?: number } | undefined)?.totalPages ?? 1);
      }
      if (!cancelled) setOptions(rows.map(toOption));
    })().catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
    // toOption is intentionally excluded: callers pass inline mappers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);
  return options;
}
