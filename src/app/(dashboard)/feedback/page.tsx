"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useSession } from "@/components/session";
import { Badge, Modal } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, dateTime } from "@/lib/client";
import { useToast } from "@/components/ui";
import { Button } from "@/components/ui";

type Feedback = {
  id: string;
  residentName: string;
  apartmentLabel: string;
  category: string;
  rating: number;
  message: string;
  submittedAt: string;
  status: "NEW" | "REVIEWED" | "RESOLVED";
  adminNote?: string;
};

const statusOptions = [{ value: "NEW", label: "New" }, { value: "REVIEWED", label: "Reviewed" }, { value: "RESOLVED", label: "Resolved" }];

const submitFields: FieldDef[] = [
  { name: "category", label: "Category", required: true, placeholder: "e.g. Cleanliness, Security" },
  { name: "rating", label: "Rating (1-5)", type: "select", required: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: "★".repeat(n) + ` (${n})` })) },
  { name: "message", label: "Your feedback", type: "textarea", required: true },
];

export default function FeedbackPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [reviewing, setReviewing] = useState<Feedback | null>(null);

  return (
    <>
      <ResourcePage<Feedback>
        title="Feedback"
        description={isAdmin ? "Review resident feedback and update its status." : "Share feedback with the society committee."}
        endpoint="/api/feedback"
        refreshKey={refresh}
        searchPlaceholder="Search message or category…"
        filters={[{ name: "status", label: "Status", options: statusOptions }]}
        columns={[
          ...(isAdmin ? [{ header: "From", cell: (f: Feedback) => `${f.residentName} (${f.apartmentLabel})` }] : []),
          { header: "Category", cell: (f) => f.category },
          { header: "Rating", cell: (f) => <span aria-label={`${f.rating} out of 5`}>{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span> },
          { header: "Message", cell: (f) => f.message, className: "max-w-sm" },
          { header: "Submitted", cell: (f) => dateTime(f.submittedAt) },
          { header: "Status", cell: (f) => <Badge value={f.status} /> },
        ]}
        createFields={
          user.role === "RESIDENT"
            ? [
                // Someone with several flats says which flat the feedback is from.
                ...(user.residencies.length > 1
                  ? [{ name: "residentId", label: "Which flat?", type: "select" as const, required: true, options: user.residencies.map((r) => ({ value: r.residentId, label: `${r.label} (${r.residentType.toLowerCase()})` })) }]
                  : []),
                ...submitFields,
              ]
            : undefined
        }
        createLabel="Submit feedback"
        rowActions={isAdmin ? (f) => (
          <Button size="sm" variant="secondary" onClick={() => setReviewing(f)}>
            Review
          </Button>
        ) : undefined}
      />
      {reviewing && (
        <Modal title="Review feedback" onClose={() => setReviewing(null)}>
          <p className="mb-4 text-sm text-slate-700">{reviewing.message}</p>
          <ResourceForm
            fields={[
              { name: "status", label: "Status", type: "select", required: true, options: statusOptions },
              { name: "adminNote", label: "Internal note", type: "textarea" },
            ]}
            initial={{ status: reviewing.status, adminNote: reviewing.adminNote ?? "" }}
            submitLabel="Save review"
            onCancel={() => setReviewing(null)}
            onSubmit={async (v) => {
              await api(`/api/feedback/${reviewing.id}`, { method: "PATCH", json: { status: v.status, ...(v.adminNote ? { adminNote: v.adminNote } : {}) } });
              notify("Feedback updated");
              setReviewing(null);
              setRefresh((n) => n + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}
