"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions } from "@/components/session";
import { Badge, Button, Modal, useToast } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, ClientError, dateTime } from "@/lib/client";

type Req = {
  id: number;
  fullName: string;
  username: string;
  email: string;
  requestedRole: string;
  phone: string | null;
  flatInfo: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
};

const ROLES = [
  { value: "RESIDENT", label: "Resident" },
  { value: "MAINTENANCE", label: "Maintenance staff" },
  { value: "SECURITY", label: "Security" },
];

export default function AccountRequestsPage() {
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [approving, setApproving] = useState<Req | null>(null);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const residents = useOptions("/api/residents?active=true", (r) => ({ value: r.id as number, label: `${r.name}${r.apartment ? ` (${(r.apartment as { block: string; flatNo: string }).block}-${(r.apartment as { block: string; flatNo: string }).flatNo})` : ""}` }));
  const staff = useOptions("/api/staff?active=true", (s) => ({ value: s.id as number, label: `${s.name} – ${s.role}` }));

  const approveFields: FieldDef[] = [
    { name: "role", label: "Role", type: "select", required: true, options: ROLES },
    { name: "residentId", label: "Linked resident (Resident role)", type: "select", options: residents },
    { name: "staffId", label: "Linked staff member (Maintenance / Security)", type: "select", options: staff },
    { name: "note", label: "Note (optional)" },
  ];

  async function review(id: number, json: Record<string, unknown>, message: string) {
    await api(`/api/account-requests/${id}`, { method: "PATCH", json });
    notify(message);
    setRefresh((n) => n + 1);
  }

  return (
    <>
      <ResourcePage<Req>
        title="Account requests"
        description="People who asked for an account from the sign-in page. Approving creates the account with the password they chose."
        endpoint="/api/account-requests"
        refreshKey={refresh}
        searchPlaceholder="Search name, username or email…"
        filters={[{ name: "status", label: "Status", options: [{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }] }]}
        columns={[
          { header: "Name", cell: (r) => r.fullName },
          { header: "Username", cell: (r) => r.username },
          { header: "Email", cell: (r) => r.email },
          { header: "Wants to be", cell: (r) => r.requestedRole.toLowerCase() },
          { header: "Flat / note", cell: (r) => [r.flatInfo, r.message].filter(Boolean).join(" · ") || "—" },
          { header: "Requested", cell: (r) => dateTime(r.createdAt) },
          { header: "Status", cell: (r) => <Badge value={r.status} /> },
        ]}
        rowActions={(r) =>
          r.status === "PENDING" && (
            <>
              <Button size="sm" onClick={() => setApproving(r)}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                Reject
              </Button>
            </>
          )
        }
      />
      {approving && (
        <Modal title={`Approve ${approving.fullName}`} onClose={() => setApproving(null)}>
          <ResourceForm
            fields={approveFields}
            initial={{ role: approving.requestedRole }}
            submitLabel="Approve and create account"
            onCancel={() => setApproving(null)}
            onSubmit={async (v) => {
              const json: Record<string, unknown> = { action: "approve", role: v.role };
              if (v.residentId) json.residentId = Number(v.residentId);
              if (v.staffId) json.staffId = Number(v.staffId);
              if (v.note) json.note = v.note;
              try {
                await review(approving.id, json, `Account created for ${approving.username}`);
                setApproving(null);
              } catch (e) {
                throw e instanceof ClientError ? e : new Error("Request failed");
              }
            }}
          />
        </Modal>
      )}
      {rejecting && (
        <Modal title={`Reject ${rejecting.fullName}`} onClose={() => setRejecting(null)}>
          <ResourceForm
            fields={[{ name: "note", label: "Reason (optional)", type: "textarea" }]}
            submitLabel="Reject request"
            onCancel={() => setRejecting(null)}
            onSubmit={async (v) => {
              await review(rejecting.id, { action: "reject", ...(v.note ? { note: v.note } : {}) }, "Request rejected");
              setRejecting(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
