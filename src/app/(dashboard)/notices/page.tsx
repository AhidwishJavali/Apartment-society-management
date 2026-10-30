"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useSession } from "@/components/session";
import { Badge, Button, ConfirmDialog, useToast } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError, dateTime } from "@/lib/client";

type Notice = {
  id: string;
  documentType: "NOTICE" | "ANNOUNCEMENT";
  title: string;
  body: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH";
  audience: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string;
  expiresAt?: string;
};

const audiences = [
  { value: "ALL", label: "Everyone" },
  { value: "OWNERS", label: "Owners" },
  { value: "TENANTS", label: "Tenants" },
  { value: "MAINTENANCE", label: "Maintenance staff" },
  { value: "SECURITY", label: "Security" },
];

const fields: FieldDef[] = [
  { name: "documentType", label: "Type", type: "select", required: true, options: [{ value: "NOTICE", label: "Notice" }, { value: "ANNOUNCEMENT", label: "Announcement" }] },
  { name: "title", label: "Title", required: true },
  { name: "body", label: "Message", type: "textarea", required: true },
  { name: "category", label: "Category", required: true, placeholder: "General" },
  { name: "priority", label: "Priority", type: "select", required: true, options: [{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }] },
  { name: "audience", label: "Audience", type: "select", required: true, options: audiences },
  { name: "expiresAt", label: "Expires (optional)", type: "datetime-local" },
];
const createFields: FieldDef[] = [...fields, { name: "publish", label: "Publish immediately", type: "checkbox" }];
const editFields = fields.filter((f) => f.name !== "documentType");

// datetime-local needs "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function NoticesPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [archiving, setArchiving] = useState<Notice | null>(null);

  async function act(n: Notice, action: "publish" | "archive") {
    try {
      await api(`/api/notices/${n.id}`, { method: "PATCH", json: { action } });
      notify(action === "publish" ? "Notice published" : "Notice archived");
      setRefresh((x) => x + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    } finally {
      setArchiving(null);
    }
  }

  return (
    <>
      <ResourcePage<Notice>
        title="Notices"
        description={isAdmin ? "Create, publish and archive notices and announcements." : "Current notices for you."}
        endpoint="/api/notices"
        refreshKey={refresh}
        searchPlaceholder="Search title or message…"
        filters={isAdmin ? [
          { name: "status", label: "Status", options: [{ value: "DRAFT", label: "Draft" }, { value: "PUBLISHED", label: "Published" }, { value: "ARCHIVED", label: "Archived" }] },
          { name: "audience", label: "Audience", options: audiences },
          { name: "from", label: "Created from", type: "date" },
          { name: "to", label: "Created to", type: "date" },
        ] : [{ name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" }]}
        columns={[
          { header: "Title", cell: (n) => <div><div className="font-medium">{n.title}</div><div className="max-w-md truncate text-xs text-slate-500">{n.body}</div></div> },
          { header: "Type", cell: (n) => n.documentType.toLowerCase() },
          { header: "Priority", cell: (n) => <Badge value={n.priority} /> },
          { header: "Audience", cell: (n) => audiences.find((a) => a.value === n.audience)?.label ?? n.audience },
          { header: "Published", cell: (n) => dateTime(n.publishedAt) },
          { header: "Expires", cell: (n) => dateTime(n.expiresAt) },
          ...(isAdmin ? [{ header: "Status", cell: (n: Notice) => <Badge value={n.status} /> }] : []),
        ]}
        createFields={isAdmin ? createFields : undefined}
        createDefaults={{ documentType: "NOTICE", category: "General", priority: "NORMAL", audience: "ALL" }}
        createLabel="New notice"
        editFields={isAdmin ? editFields : undefined}
        canEdit={(n) => n.status !== "ARCHIVED"}
        toFormValues={(n) => ({ title: n.title, body: n.body, category: n.category, priority: n.priority, audience: n.audience, expiresAt: toLocalInput(n.expiresAt) })}
        rowActions={isAdmin ? (n) => (
          <>
            {n.status === "DRAFT" && <Button size="sm" variant="ghost" onClick={() => act(n, "publish")}>Publish</Button>}
            {n.status !== "ARCHIVED" && <Button size="sm" variant="secondary" onClick={() => setArchiving(n)}>Archive</Button>}
          </>
        ) : undefined}
      />
      {archiving && (
        <ConfirmDialog
          title="Archive notice?"
          message={`“${archiving.title}” will no longer be shown to residents or staff.`}
          confirmLabel="Archive"
          onConfirm={() => act(archiving, "archive")}
          onCancel={() => setArchiving(null)}
        />
      )}
    </>
  );
}
