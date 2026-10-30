"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useSession } from "@/components/session";
import { Alert, Button, Modal, Spinner } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError, money } from "@/lib/client";

type Apartment = { id: number; block: string; floorNo: number; flatNo: string; bhk: number; _count?: { residents: number } };
type Detail = Apartment & {
  residents?: { id: number; name: string; residentType: string; isActive: boolean }[];
  paymentSummary: { paidTotal: string | number; paidCount: number; pendingTotal: string | number; pendingCount: number };
};

const fields: FieldDef[] = [
  { name: "block", label: "Block", required: true },
  { name: "floorNo", label: "Floor", type: "number", required: true },
  { name: "flatNo", label: "Flat number", required: true },
  { name: "bhk", label: "BHK", type: "number", required: true },
];

export default function ApartmentsPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(id: number) {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      setDetail((await api<Detail>(`/api/apartments/${id}`)).data);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : "Failed to load apartment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ResourcePage<Apartment>
        title="Apartments"
        description={isAdmin ? "All flats in the society." : "Your flat."}
        endpoint="/api/apartments"
        searchPlaceholder="Search block or flat…"
        columns={[
          { header: "Block", cell: (r) => r.block },
          { header: "Flat", cell: (r) => r.flatNo },
          { header: "Floor", cell: (r) => r.floorNo },
          { header: "BHK", cell: (r) => r.bhk },
          ...(isAdmin ? [{ header: "Residents", cell: (r: Apartment) => r._count?.residents ?? 0 }] : []),
        ]}
        rowActions={(r) => (
          <Button size="sm" variant="ghost" onClick={() => open(r.id)}>
            View
          </Button>
        )}
        createFields={isAdmin ? fields : undefined}
        createLabel="Add apartment"
        editFields={isAdmin ? fields : undefined}
        toFormValues={(r) => ({ block: r.block, floorNo: String(r.floorNo), flatNo: r.flatNo, bhk: String(r.bhk) })}
        removeLabel={isAdmin ? "Delete" : undefined}
        removeMessage={(r) => `Delete flat ${r.block}-${r.flatNo}? Flats with residents, parking or payment history cannot be deleted.`}
      />
      {(loading || detail || error) && (
        <Modal title="Apartment details" onClose={() => { setDetail(null); setError(null); setLoading(false); }}>
          {loading && <Spinner />}
          {error && <Alert>{error}</Alert>}
          {detail && (
            <div className="space-y-4 text-sm">
              <p className="text-base font-medium">
                {detail.block}-{detail.flatNo} · Floor {detail.floorNo} · {detail.bhk} BHK
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-green-200 bg-green-50 p-3">
                  <div className="text-xs text-green-800">Paid ({detail.paymentSummary.paidCount})</div>
                  <div className="text-lg font-semibold">{money(detail.paymentSummary.paidTotal)}</div>
                </div>
                <div className="rounded border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs text-amber-900">Pending ({detail.paymentSummary.pendingCount})</div>
                  <div className="text-lg font-semibold">{money(detail.paymentSummary.pendingTotal)}</div>
                </div>
              </div>
              {detail.residents && (
                <div>
                  <h3 className="mb-1 font-medium">Residents</h3>
                  {detail.residents.length === 0 ? (
                    <p className="text-slate-500">No residents linked to this flat.</p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {detail.residents.map((r) => (
                        <li key={r.id}>
                          {r.name} ({r.residentType.toLowerCase()}){!r.isActive && " – inactive"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
