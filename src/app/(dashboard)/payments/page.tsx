"use client";

import { useEffect, useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Badge, Button, Modal, useToast } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, dateOnly, money } from "@/lib/client";
import { formatBillingMonth } from "@/lib/rules";

type Payment = {
  id: number;
  apartmentId: number;
  amount: string;
  paymentMonth: string;
  paymentDate: string | null;
  status: "PAID" | "PENDING";
  apartment: { block: string; flatNo: string };
};
type Summary = { paidTotal: string | number; paidCount: number; pendingTotal: string | number; pendingCount: number };

function Totals({ query, tick }: { query: string; tick: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(query);
    params.delete("status"); // totals always show both sides
    api<Summary>(`/api/payments/summary?${params}`).then((r) => setSummary(r.data)).catch(() => setSummary(null));
  }, [query, tick]);
  if (!summary) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
        <span className="text-green-800">Collected ({summary.paidCount}): </span>
        <strong>{money(summary.paidTotal)}</strong>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <span className="text-amber-900">Pending ({summary.pendingCount}): </span>
        <strong>{money(summary.pendingTotal)}</strong>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [paying, setPaying] = useState<Payment | null>(null);
  const apartments = useOptions(isAdmin ? "/api/apartments" : null, (a) => ({ value: a.id as number, label: `${a.block}-${a.flatNo}` }));

  const statusOptions = [{ value: "PAID", label: "Paid" }, { value: "PENDING", label: "Pending" }];
  const createFields: FieldDef[] = [
    { name: "apartmentId", label: "Apartment", type: "select", required: true, options: apartments },
    { name: "paymentMonth", label: "Billing month", type: "month", required: true },
    { name: "amount", label: "Amount (₹)", type: "number", step: "0.01", required: true },
    { name: "status", label: "Status", type: "select", required: true, options: statusOptions },
    { name: "paymentDate", label: "Payment date", type: "date", help: "Required when status is Paid; leave empty for Pending" },
  ];
  const editFields = createFields.filter((f) => f.name !== "apartmentId" && f.name !== "paymentMonth");

  return (
    <>
      <ResourcePage<Payment>
        title="Maintenance payments"
        description={isAdmin ? "Monthly maintenance bills per flat." : "Your flat's payment history and pending balance."}
        endpoint="/api/payments"
        refreshKey={refresh}
        searchPlaceholder="Search block or flat…"
        summary={(query, tick) => <Totals query={query} tick={tick} />}
        filters={[
          { name: "status", label: "Status", options: statusOptions },
          { name: "month", label: "Month (YYYY-MM)", options: monthOptions() },
        ]}
        columns={[
          { header: "Flat", cell: (p) => `${p.apartment.block}-${p.apartment.flatNo}` },
          { header: "Month", cell: (p) => formatBillingMonth(p.paymentMonth) },
          { header: "Amount", cell: (p) => money(p.amount) },
          { header: "Paid on", cell: (p) => dateOnly(p.paymentDate) },
          { header: "Status", cell: (p) => <Badge value={p.status} /> },
        ]}
        createFields={isAdmin ? createFields : undefined}
        createLabel="Add bill"
        editFields={isAdmin ? editFields : undefined}
        toFormValues={(p) => ({ amount: p.amount, status: p.status, paymentDate: dateOnly(p.paymentDate) === "—" ? "" : dateOnly(p.paymentDate) })}
        rowActions={isAdmin ? (p) => p.status === "PENDING" && (
          <Button size="sm" variant="ghost" onClick={() => setPaying(p)}>
            Mark paid
          </Button>
        ) : undefined}
      />
      {paying && (
        <Modal title={`Record payment – ${paying.apartment.block}-${paying.apartment.flatNo}`} onClose={() => setPaying(null)}>
          <ResourceForm
            fields={[{ name: "paymentDate", label: "Payment date", type: "date", required: true }]}
            initial={{ paymentDate: new Date().toISOString().slice(0, 10) }}
            submitLabel="Mark as paid"
            onCancel={() => setPaying(null)}
            onSubmit={async (v) => {
              await api(`/api/payments/${paying.id}`, { method: "PATCH", json: { status: "PAID", paymentDate: v.paymentDate } });
              notify("Payment recorded");
              setPaying(null);
              setRefresh((n) => n + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}

/** Last 12 billing months as filter options. */
function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = d.toISOString().slice(0, 7);
    out.push({ value, label: formatBillingMonth(value) });
  }
  return out;
}
