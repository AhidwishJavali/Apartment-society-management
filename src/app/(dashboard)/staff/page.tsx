"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { Badge, Button, ConfirmDialog, useToast } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError, money } from "@/lib/client";

type Staff = { id: number; name: string; role: string; phone: string | null; salary: string | null; isActive: boolean };

const fields: FieldDef[] = [
  { name: "name", label: "Full name", required: true },
  { name: "role", label: "Role", required: true, placeholder: "e.g. Electrician, Security Guard" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "salary", label: "Monthly salary (₹)", type: "number", step: "0.01" },
];

export default function StaffPage() {
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [toggle, setToggle] = useState<Staff | null>(null);

  async function setActive(s: Staff, isActive: boolean) {
    try {
      await api(`/api/staff/${s.id}`, { method: "PATCH", json: { isActive } });
      notify(isActive ? "Staff member reactivated" : "Staff member deactivated");
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    } finally {
      setToggle(null);
    }
  }

  return (
    <>
      <ResourcePage<Staff>
        title="Staff"
        description="Maintenance, security and housekeeping staff."
        endpoint="/api/staff"
        refreshKey={refresh}
        searchPlaceholder="Search name, role or phone…"
        filters={[{ name: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] }]}
        columns={[
          { header: "Name", cell: (s) => s.name },
          { header: "Role", cell: (s) => s.role },
          { header: "Phone", cell: (s) => s.phone ?? "—" },
          { header: "Salary", cell: (s) => (s.salary ? money(s.salary) : "—") },
          { header: "Status", cell: (s) => <Badge value={s.isActive ? "AVAILABLE" : "INACTIVE"} /> },
        ]}
        createFields={fields}
        createLabel="Add staff"
        editFields={fields}
        toFormValues={(s) => ({ name: s.name, role: s.role, phone: s.phone ?? "", salary: s.salary ?? "" })}
        rowActions={(s) => (
          <Button size="sm" variant="secondary" onClick={() => (s.isActive ? setToggle(s) : setActive(s, true))}>
            {s.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
        removeLabel="Delete"
        removeMessage={(s) => `Delete ${s.name}? Staff with complaint history or an account can only be deactivated.`}
      />
      {toggle && (
        <ConfirmDialog
          title="Deactivate staff member?"
          message={`${toggle.name} will no longer be assignable or able to sign in. Complaint history is kept.`}
          confirmLabel="Deactivate"
          onConfirm={() => setActive(toggle, false)}
          onCancel={() => setToggle(null)}
        />
      )}
    </>
  );
}
