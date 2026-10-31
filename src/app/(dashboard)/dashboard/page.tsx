"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api, ClientError, money } from "@/lib/client";
import { useSession } from "@/components/session";

type Charts = {
  payments?: { month: string; paid: number; pending: number }[];
  complaints?: { status: string; count: number }[];
};

function PaymentsChart({ rows }: { rows: NonNullable<Charts["payments"]> }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.pending]));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-700">Maintenance by month (₹)</h2>
      <div role="img" aria-label="Paid and pending maintenance per month" className="mt-4 flex h-40 items-end gap-3">
        {rows.map((r) => (
          <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <div className="w-1/3 rounded-t bg-emerald-500" style={{ height: `${(r.paid / max) * 100}%` }} title={`Paid ${money(r.paid)}`} />
              <div className="w-1/3 rounded-t bg-amber-500" style={{ height: `${(r.pending / max) * 100}%` }} title={`Pending ${money(r.pending)}`} />
            </div>
            <span className="text-xs text-slate-500">{r.month}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-600">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Paid</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />Pending</span>
      </div>
    </div>
  );
}

function ComplaintsChart({ rows }: { rows: NonNullable<Charts["complaints"]> }) {
  const total = Math.max(1, rows.reduce((n, r) => n + r.count, 0));
  const colour: Record<string, string> = { OPEN: "bg-rose-500", IN_PROGRESS: "bg-amber-500", RESOLVED: "bg-emerald-500" };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-700">Complaints by status</h2>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.status}>
            <div className="flex justify-between text-xs text-slate-600">
              <span>{r.status.replace("_", " ")}</span>
              <span>{r.count}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-slate-100">
              <div className={`h-2 rounded ${colour[r.status] ?? "bg-slate-400"}`} style={{ width: `${(r.count / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Stat = { key: string; label: string; value: number | string; href?: string; error?: boolean };

export default function DashboardPage() {
  const user = useSession();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [charts, setCharts] = useState<Charts>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ stats: Stat[]; charts: Charts }>("/api/dashboard")
      .then((r) => {
        setStats(r.data.stats);
        setCharts(r.data.charts ?? {});
      })
      .catch((e: unknown) => setError(e instanceof ClientError ? e.message : "Failed to load dashboard"));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {user.role === "RESIDENT" && user.residentType === "OWNER" && "Owner view: your flat's bills, household, parking and vehicles."}
          {user.role === "RESIDENT" && user.residentType === "TENANT" && "Tenant view: your complaints, parking and vehicles. Maintenance bills are handled by the flat's owner."}
          {user.role !== "RESIDENT" && "Live figures from the society databases."}
        </p>
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
      {(charts.payments?.length || charts.complaints?.length) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.payments?.length ? <PaymentsChart rows={charts.payments} /> : null}
          {charts.complaints?.length ? <ComplaintsChart rows={charts.complaints} /> : null}
        </div>
      ) : null}
      {stats?.length === 0 && <p className="text-sm text-slate-600">No figures are available for your role.</p>}
    </div>
  );
}
