"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { ResourceForm, buildPayload, type FieldDef } from "@/components/ResourceForm";
import { api } from "@/lib/client";

const fields: FieldDef[] = [
  { name: "fullName", label: "Full name", required: true },
  { name: "username", label: "Username", required: true, help: "Letters, digits, . _ - only" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "password", label: "Password", type: "password", required: true, help: "At least 10 characters" },
  {
    name: "requestedRole",
    label: "I am a",
    type: "select",
    required: true,
    options: [
      { value: "RESIDENT", label: "Resident" },
      { value: "MAINTENANCE", label: "Maintenance staff" },
      { value: "SECURITY", label: "Security" },
    ],
  },
  { name: "flatInfo", label: "Flat (residents), e.g. A-101" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "message", label: "Note for the administrator", type: "textarea" },
];

export default function RequestAccountPage() {
  const [done, setDone] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Request an account</h1>
          <p className="mt-1 text-sm text-slate-600">An administrator reviews every request. You can sign in once it is approved.</p>
        </div>
        {done ? (
          <>
            <Alert kind="success">{done}</Alert>
            <Link href="/login">
              <Button className="w-full">Back to sign in</Button>
            </Link>
          </>
        ) : (
          <ResourceForm
            fields={fields}
            submitLabel="Submit request"
            onCancel={() => (window.location.href = "/login")}
            onSubmit={async (values) => {
              const res = await api<{ message: string }>("/api/auth/request-account", { method: "POST", json: buildPayload(fields, values, "create") });
              setDone(res.data.message);
            }}
          />
        )}
      </div>
    </main>
  );
}
