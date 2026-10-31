"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { api, ClientError } from "@/lib/client";
import type { Role } from "@/lib/rules";

const HOME: Record<Role, string> = {
  ADMIN: "/dashboard",
  RESIDENT: "/dashboard",
  MAINTENANCE: "/complaints",
  SECURITY: "/visitors",
};

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api<{ role: Role }>("/api/auth/login", { method: "POST", json: { identifier, password } });
      window.location.href = HOME[res.data.role]; // full navigation so the new cookie is picked up
    } catch (err) {
      if (err instanceof ClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else setError("Unexpected error");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Apartment Society Management</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to continue</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <Field label="Username or email" required error={fieldErrors.identifier?.[0]}>
          {(id) => <input id={id} className={inputClass} autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}
        </Field>
        <Field label="Password" required error={fieldErrors.password?.[0]}>
          {(id) => <input id={id} type="password" className={inputClass} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-slate-600">
          New here?{" "}
          <Link href="/request-account" className="font-medium text-brand-700 hover:underline">
            Request an account
          </Link>
        </p>
      </form>
    </main>
  );
}
