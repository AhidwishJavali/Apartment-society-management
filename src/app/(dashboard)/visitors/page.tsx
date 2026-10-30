"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions } from "@/components/session";
import { Badge, Button, useToast } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError, dateTime } from "@/lib/client";

type Visitor = {
  id: string;
  visitorName: string;
  phone?: string;
  purpose: string;
  apartmentId: number;
  apartmentLabel: string;
  vehicleNumber?: string;
  entryTime: string;
  exitTime?: string;
  status: "INSIDE" | "EXITED";
};

export default function VisitorsPage() {
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const apartments = useOptions("/api/apartments", (a) => ({ value: a.id as number, label: `${a.block}-${a.flatNo}` }));

  const fields: FieldDef[] = [
    { name: "visitorName", label: "Visitor name", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "purpose", label: "Purpose of visit", required: true },
    { name: "apartmentId", label: "Destination apartment", type: "select", required: true, options: apartments },
    { name: "hostResidentId", label: "Host resident (optional)", type: "select", optionsFrom: { field: "apartmentId", param: "apartmentId", endpoint: "/api/residents/hosts" } },
    { name: "vehicleNumber", label: "Vehicle number (optional)" },
  ];

  async function recordExit(v: Visitor) {
    try {
      await api(`/api/visitors/${v.id}`, { method: "PATCH", json: { action: "exit" } });
      notify(`Exit recorded for ${v.visitorName}`);
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    }
  }

  return (
    <ResourcePage<Visitor>
      title="Visitors"
      description="Register entries and exits; search history by flat, name and date."
      endpoint="/api/visitors"
      refreshKey={refresh}
      searchPlaceholder="Search visitor name…"
      filters={[
        { name: "apartmentId", label: "Apartment", options: apartments },
        { name: "status", label: "Status", options: [{ value: "INSIDE", label: "Inside" }, { value: "EXITED", label: "Exited" }] },
        { name: "from", label: "From", type: "date" },
        { name: "to", label: "To", type: "date" },
      ]}
      columns={[
        { header: "Visitor", cell: (v) => v.visitorName },
        { header: "Purpose", cell: (v) => v.purpose },
        { header: "Flat", cell: (v) => v.apartmentLabel },
        { header: "Vehicle", cell: (v) => v.vehicleNumber ?? "—" },
        { header: "Entry", cell: (v) => dateTime(v.entryTime) },
        { header: "Exit", cell: (v) => dateTime(v.exitTime) },
        { header: "Status", cell: (v) => <Badge value={v.status} /> },
      ]}
      createFields={fields}
      createLabel="Register entry"
      rowActions={(v) => v.status === "INSIDE" && (
        <Button size="sm" variant="secondary" onClick={() => recordExit(v)}>
          Record exit
        </Button>
      )}
    />
  );
}
