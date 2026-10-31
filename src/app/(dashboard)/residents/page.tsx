"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Badge, Button, ConfirmDialog, useToast } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError } from "@/lib/client";

type Resident = {
  id: number;
  apartmentId: number;
  name: string;
  phone: string | null;
  email: string | null;
  residentType: "OWNER" | "TENANT";
  isActive: boolean;
  apartment: { block: string; flatNo: string };
  account?: { id: number; username: string } | null;
};

export default function ResidentsPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [toggle, setToggle] = useState<Resident | null>(null);
  const apartments = useOptions(isAdmin ? "/api/apartments" : null, (a) => ({ value: a.id as number, label: `${a.block}-${a.flatNo}` }));

  const fields: FieldDef[] = [
    { name: "apartmentId", label: "Apartment", type: "select", required: true, options: apartments },
    { name: "name", label: "Full name", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "residentType", label: "Type", type: "select", required: true, options: [{ value: "OWNER", label: "Owner" }, { value: "TENANT", label: "Tenant" }] },
  ];

  async function setActive(r: Resident, isActive: boolean) {
    try {
      await api(`/api/residents/${r.id}`, { method: "PATCH", json: { isActive } });
      notify(isActive ? "Resident reactivated" : "Resident deactivated");
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    } finally {
      setToggle(null);
    }
  }

  return (
    <>
      <ResourcePage<Resident>
        title={isAdmin ? "Residents" : user.isOwner ? "My household" : "My profile"}
        description={isAdmin ? "Owners and tenants, one row per person per flat. A person with several flats has several rows sharing one login." : user.isOwner ? "Everyone registered in the flats you own, including tenants, plus your own rows." : "Your profile."}
        endpoint="/api/residents"
        refreshKey={refresh}
        searchPlaceholder="Search name, email or phone…"
        filters={isAdmin ? [
          { name: "residentType", label: "Type", options: [{ value: "OWNER", label: "Owner" }, { value: "TENANT", label: "Tenant" }] },
          { name: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
          { name: "apartmentId", label: "Apartment", options: apartments },
        ] : []}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Flat", cell: (r) => `${r.apartment.block}-${r.apartment.flatNo}` },
          { header: "Type", cell: (r) => <Badge value={r.residentType} /> },
          { header: "Phone", cell: (r) => r.phone ?? "—" },
          { header: "Email", cell: (r) => r.email ?? "—" },
          ...(isAdmin ? [{ header: "Login", cell: (r: Resident) => r.account?.username ?? "—" }] : []),
          { header: "Status", cell: (r) => <Badge value={r.isActive ? "AVAILABLE" : "INACTIVE"} /> },
        ]}
        createFields={isAdmin ? fields : undefined}
        createLabel="Add resident"
        editFields={isAdmin ? fields : undefined}
        toFormValues={(r) => ({ apartmentId: String(r.apartmentId), name: r.name, phone: r.phone ?? "", email: r.email ?? "", residentType: r.residentType })}
        rowActions={isAdmin ? (r) => (
          <Button size="sm" variant="secondary" onClick={() => (r.isActive ? setToggle(r) : setActive(r, true))}>
            {r.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        ) : undefined}
        removeLabel={isAdmin ? "Delete" : undefined}
        removeMessage={(r) => `Delete ${r.name}? Residents with vehicles, complaints or an account can only be deactivated.`}
      />
      {toggle && (
        <ConfirmDialog
          title="Deactivate resident?"
          message={`${toggle.name} will no longer be able to sign in. Their history is kept.`}
          confirmLabel="Deactivate"
          onConfirm={() => setActive(toggle, false)}
          onCancel={() => setToggle(null)}
        />
      )}
    </>
  );
}
