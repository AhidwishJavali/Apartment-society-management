"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Badge, Button, Modal, useToast } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, ClientError, dateTime } from "@/lib/client";

type Account = {
  id: number;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  residencies: { id: number; name: string; residentType: string; isActive: boolean; apartment: { block: string; flatNo: string } }[];
  staff: { name: string } | null;
};

export default function AccountsPage() {
  const me = useSession();
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [resetting, setResetting] = useState<Account | null>(null);
  const residents = useOptions("/api/residents?active=true", (r) => ({ value: r.id as number, label: `${r.name} (${(r.apartment as { block: string; flatNo: string }).block}-${(r.apartment as { block: string; flatNo: string }).flatNo}, ${String(r.residentType).toLowerCase()})` }));
  const [linking, setLinking] = useState<Account | null>(null);
  const staff = useOptions("/api/staff?active=true", (s) => ({ value: s.id as number, label: `${s.name} – ${s.role}` }));

  const fields: FieldDef[] = [
    { name: "username", label: "Username", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "password", label: "Initial password", type: "password", required: true, help: "At least 10 characters. Share it securely; it is stored only as a hash." },
    { name: "role", label: "Role", type: "select", required: true, options: [
      { value: "ADMIN", label: "Administrator" }, { value: "RESIDENT", label: "Resident" },
      { value: "MAINTENANCE", label: "Maintenance staff" }, { value: "SECURITY", label: "Security" },
    ] },
    { name: "residentId", label: "Linked resident (RESIDENT role)", type: "select", options: residents },
    { name: "staffId", label: "Linked staff member (MAINTENANCE / SECURITY)", type: "select", options: staff },
  ];

  async function toggle(a: Account) {
    try {
      await api(`/api/accounts/${a.id}`, { method: "PATCH", json: { isActive: !a.isActive } });
      notify(a.isActive ? "Account deactivated" : "Account activated");
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    }
  }

  return (
    <>
      <ResourcePage<Account>
        title="Accounts"
        description="Sign-in accounts. Each non-admin account is linked to a resident or staff member."
        endpoint="/api/accounts"
        refreshKey={refresh}
        searchPlaceholder="Search username or email…"
        columns={[
          { header: "Username", cell: (a) => a.username },
          { header: "Email", cell: (a) => a.email },
          { header: "Role", cell: (a) => a.role.toLowerCase() },
          {
            header: "Linked to",
            cell: (a) =>
              a.residencies.length
                ? a.residencies.map((r) => `${r.name}, ${r.apartment.block}-${r.apartment.flatNo} (${r.residentType.toLowerCase()}${r.isActive ? "" : ", inactive"})`).join("; ")
                : a.staff?.name ?? "—",
          },
          { header: "Last sign-in", cell: (a) => dateTime(a.lastLoginAt) },
          { header: "Status", cell: (a) => <Badge value={a.isActive ? "AVAILABLE" : "INACTIVE"} /> },
        ]}
        createFields={fields}
        createLabel="Add account"
        rowActions={(a) => (
          <>
            <Button size="sm" variant="secondary" onClick={() => setResetting(a)}>
              Reset password
            </Button>
            {a.role === "RESIDENT" && (
              <Button size="sm" variant="secondary" onClick={() => setLinking(a)}>
                Link another flat
              </Button>
            )}
            {a.id !== me.id && (
              <Button size="sm" variant="secondary" onClick={() => toggle(a)}>
                {a.isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
          </>
        )}
      />
      {linking && (
        <Modal title={`Link another flat – ${linking.username}`} onClose={() => setLinking(null)}>
          <p className="mb-3 text-sm text-slate-600">
            For a person who owns or rents more than one flat. Pick their resident row in the other flat (add it on the Residents page first if needed).
          </p>
          <ResourceForm
            fields={[{ name: "linkResidentId", label: "Resident row in the other flat", type: "select", required: true, options: residents }]}
            submitLabel="Link flat"
            onCancel={() => setLinking(null)}
            onSubmit={async (v) => {
              await api(`/api/accounts/${linking.id}`, { method: "PATCH", json: { linkResidentId: Number(v.linkResidentId) } });
              notify("Flat linked");
              setLinking(null);
              setRefresh((n) => n + 1);
            }}
          />
        </Modal>
      )}
      {resetting && (
        <Modal title={`Reset password – ${resetting.username}`} onClose={() => setResetting(null)}>
          <ResourceForm
            fields={[{ name: "password", label: "New password", type: "password", required: true }]}
            submitLabel="Reset password"
            onCancel={() => setResetting(null)}
            onSubmit={async (v) => {
              await api(`/api/accounts/${resetting.id}`, { method: "PATCH", json: { password: v.password } });
              notify("Password updated");
              setResetting(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
