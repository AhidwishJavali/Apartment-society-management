"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api, ClientError, money } from "@/lib/client";
import { useSession } from "@/components/session";

type Stat = { key: string; label: string; value: number | string; href?: string; error?: boolean };

export default function DashboardPage() {
  const user = useSession();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ stats: Stat[] }>("/api/dashboard")
      .then((r) => setStats(r.data.stats))
      .catch((e: unknown) => setError(e instanceof ClientError ? e.message : "Failed to load dashboard"));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">Live figures from the society databases.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {!stats && !error && <Spinner />}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => {
            const value = s.key === "pendingAmount" ? money(s.value) : String(s.value);
            const body = (
              <div className={`rounded-lg border bg-white p-4 ${s.error ? "border-amber-300" : "border-slate-200"} ${s.href ? "hover:border-brand-500" : ""}`}>
                <div className="text-sm text-slate-500">{s.label.replace(" (₹)", "")}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
              </div>
            );
            return s.href ? (
              <Link key={s.key} href={s.href}>
                {body}
              </Link>
            ) : (
              <div key={s.key}>{body}</div>
            );
          })}
        </div>
      )}
      {stats?.length === 0 && <p className="text-sm text-slate-600">No figures are available for your role.</p>}
    </div>
  );
}
