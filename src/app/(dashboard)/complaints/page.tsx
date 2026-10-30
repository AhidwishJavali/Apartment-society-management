"use client";

import { useEffect, useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Alert, Badge, Button, Modal, Spinner, useToast } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, ClientError, dateOnly, dateTime } from "@/lib/client";
import { canTransitionComplaint, COMPLAINT_STATUSES, type ComplaintStatus } from "@/lib/rules";

type Complaint = {
  id: number;
  category: string;
  description: string | null;
  complaintDate: string;
  status: ComplaintStatus;
  staffId: number | null;
  resident: { id: number; name: string; apartment: { block: string; flatNo: string } };
  staff: { id: number; name: string; role: string } | null;
};
type Activity = { id: string; action: string; actorName?: string; actorRole: string; oldStatus?: string; newStatus?: string; note?: string; createdAt: string };

const CATEGORIES = ["Electrical", "Plumbing", "Security", "Maintenance", "Cleaning", "Other"].map((c) => ({ value: c, label: c }));

function Timeline({ complaint, onChanged }: { complaint: Complaint; onChanged: () => void }) {
  const notify = useToast();
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<{ activity: Activity[]; activityAvailable: boolean }>(`/api/complaints/${complaint.id}`)
      .then((r) => {
        setActivity(r.data.activity);
        setAvailable(r.data.activityAvailable);
      })
      .catch(() => setActivity([]));
  }, [complaint.id, tick]);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium">
          {complaint.category} · <Badge value={complaint.status} />
        </p>
        <p className="mt-1 text-slate-700">{complaint.description}</p>
        <p className="mt-1 text-xs text-slate-500">
          {complaint.resident.name} ({complaint.resident.apartment.block}-{complaint.resident.apartment.flatNo}) · {dateOnly(complaint.complaintDate)} · Assigned to {complaint.staff?.name ?? "nobody yet"}
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-medium">Activity</h3>
        {!activity ? (
          <Spinner />
        ) : !available ? (
          <Alert kind="warning">The activity history is temporarily unavailable.</Alert>
        ) : activity.length === 0 ? (
          <p className="text-slate-500">No activity recorded yet.</p>
        ) : (
          <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
            {activity.map((a) => (
              <li key={a.id}>
                <div className="text-xs text-slate-500">
                  {dateTime(a.createdAt)} · {a.actorName ?? a.actorRole}
                </div>
                <div>
                  <span className="font-medium">{a.action.replace("_", " ").toLowerCase()}</span>
                  {a.newStatus && a.oldStatus !== a.newStatus && (
                    <span className="text-slate-600">
                      {" "}
                      {a.oldStatus ? `${a.oldStatus} → ` : ""}
                      {a.newStatus}
                    </span>
                  )}
                </div>
                {a.note && <div className="text-slate-700">{a.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <ResourceForm
        fields={[{ name: "note", label: "Add a note", type: "textarea", required: true }]}
        submitLabel="Add note"
        onCancel={() => onChanged()}
        onSubmit={async (v) => {
          await api(`/api/complaints/${complaint.id}/activity`, { method: "POST", json: { note: v.note } });
          notify("Note added");
          setTick((n) => n + 1);
        }}
      />
    </div>
  );
}

export default function ComplaintsPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [viewing, setViewing] = useState<Complaint | null>(null);
  const [assigning, setAssigning] = useState<Complaint | null>(null);
  const reload = () => setRefresh((n) => n + 1);

  const staff = useOptions(isAdmin ? "/api/staff?active=true" : null, (s) => ({ value: s.id as number, label: `${s.name} – ${s.role}` }));
  const residents = useOptions(isAdmin ? "/api/residents?active=true" : null, (r) => ({ value: r.id as number, label: String(r.name) }));

  const createFields: FieldDef[] = [
    ...(isAdmin ? [{ name: "residentId", label: "On behalf of resident", type: "select" as const, required: true, options: residents }] : []),
    { name: "category", label: "Category", type: "select", required: true, options: CATEGORIES },
    { name: "description", label: "Describe the problem", type: "textarea", required: true },
  ];

  async function changeStatus(c: Complaint, status: ComplaintStatus) {
    try {
      const res = await api(`/api/complaints/${c.id}`, { method: "PATCH", json: { action: "status", status } });
      notify(res.warning ?? `Marked ${status.replace("_", " ").toLowerCase()}`, res.warning ? "warning" : "success");
      reload();
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    }
  }

  return (
    <>
      <ResourcePage<Complaint>
        title="Complaints"
        description={isAdmin ? "Assign staff and track every complaint." : user.role === "MAINTENANCE" ? "Work assigned to you." : "Your complaints and their progress."}
        endpoint="/api/complaints"
        refreshKey={refresh}
        searchPlaceholder="Search description or category…"
        filters={[
          { name: "status", label: "Status", options: COMPLAINT_STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") })) },
          { name: "category", label: "Category", options: CATEGORIES },
        ]}
        columns={[
          { header: "#", cell: (c) => c.id },
          { header: "Date", cell: (c) => dateOnly(c.complaintDate) },
          { header: "Category", cell: (c) => c.category },
          { header: "Description", cell: (c) => c.description ?? "—", className: "max-w-xs truncate" },
          { header: "Resident", cell: (c) => `${c.resident.name} (${c.resident.apartment.block}-${c.resident.apartment.flatNo})` },
          { header: "Assigned to", cell: (c) => c.staff?.name ?? "—" },
          { header: "Status", cell: (c) => <Badge value={c.status} /> },
        ]}
        createFields={user.role === "MAINTENANCE" ? undefined : createFields}
        createLabel="New complaint"
        rowActions={(c, ) => (
          <>
            <Button size="sm" variant="ghost" onClick={() => setViewing(c)}>
              Details
            </Button>
            {isAdmin && c.status !== "RESOLVED" && (
              <Button size="sm" variant="secondary" onClick={() => setAssigning(c)}>
                {c.staffId ? "Reassign" : "Assign"}
              </Button>
            )}
            {(user.role === "ADMIN" || user.role === "MAINTENANCE") &&
              COMPLAINT_STATUSES.filter((s) => canTransitionComplaint(user.role, c.status, s) && c.staffId !== null).map((s) => (
                <Button key={s} size="sm" variant="secondary" onClick={() => changeStatus(c, s)}>
                  {c.status === "RESOLVED" ? "Reopen" : s === "RESOLVED" ? "Resolve" : "Start"}
                </Button>
              ))}
          </>
        )}
      />
      {viewing && (
        <Modal title={`Complaint #${viewing.id}`} onClose={() => setViewing(null)} wide>
          <Timeline complaint={viewing} onChanged={() => setViewing(null)} />
        </Modal>
      )}
      {assigning && (
        <Modal title={`Assign complaint #${assigning.id}`} onClose={() => setAssigning(null)}>
          <ResourceForm
            fields={[
              { name: "staffId", label: "Staff member", type: "select", required: true, options: staff },
              { name: "note", label: "Note (optional)", type: "textarea" },
            ]}
            initial={{ staffId: assigning.staffId ? String(assigning.staffId) : "" }}
            submitLabel="Assign"
            onCancel={() => setAssigning(null)}
            onSubmit={async (v) => {
              const res = await api(`/api/complaints/${assigning.id}`, {
                method: "PATCH",
                json: { action: "assign", staffId: Number(v.staffId), ...(v.note ? { note: v.note } : {}) },
              });
              notify(res.warning ?? "Complaint assigned", res.warning ? "warning" : "success");
              setAssigning(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
