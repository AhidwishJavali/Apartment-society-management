"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ClientError, type Option } from "@/lib/client";
import { Alert, Button, Field, inputClass } from "./ui";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "tel" | "date" | "month" | "datetime-local" | "select" | "textarea" | "checkbox" | "password";
  required?: boolean;
  options?: Option[];
  /** Select whose options are fetched from `endpoint?<param>=<value of field>` (rows need id and name). */
  optionsFrom?: { field: string; param: string; endpoint: string };
  help?: string;
  step?: string;
  placeholder?: string;
};

export type FormValues = Record<string, string | boolean>;

/** Turns raw form strings into a JSON payload. Blank optional fields are omitted (create) or null (edit). */
export function buildPayload(fields: FieldDef[], values: FormValues, mode: "create" | "edit"): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (f.type === "checkbox") {
      payload[f.name] = Boolean(raw);
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") {
      if (mode === "edit" && !f.required) payload[f.name] = null;
      continue;
    }
    payload[f.name] = f.type === "number" || (f.type === "select" && /^\d+$/.test(text) && (f.optionsFrom || f.options?.some((o) => typeof o.value === "number"))) ? Number(text) : text;
  }
  return payload;
}

function DependentSelect({ id, def, parentValue, value, onChange }: { id: string; def: FieldDef; parentValue: string; value: string; onChange: (v: string) => void }) {
  const [options, setOptions] = useState<Option[]>([]);
  const endpoint = def.optionsFrom?.endpoint;
  const param = def.optionsFrom?.param;
  useEffect(() => {
    if (!endpoint || !param || !parentValue) {
      setOptions((prev) => (prev.length ? [] : prev));
      return;
    }
    let cancelled = false;
    api<{ id: number; name: string }[]>(`${endpoint}?${param}=${encodeURIComponent(parentValue)}`)
      .then((r) => {
        if (cancelled) return;
        setOptions(r.data.map((x) => ({ value: x.id, label: x.name })));
        // A host picked for a previous apartment is no longer valid.
        if (value && !r.data.some((x) => String(x.id) === value)) onChange("");
      })
      .catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
    // value/onChange are read only to clear a stale selection when the parent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, param, parentValue]);
  return (
    <select id={id} className={inputClass} required={def.required} value={value} onChange={(e) => onChange(e.target.value)} disabled={!parentValue}>
      <option value="">{parentValue ? "None" : "Select an apartment first"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ResourceForm({
  fields,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  fields: FieldDef[];
  initial?: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    const base: FormValues = {};
    for (const f of fields) base[f.name] = f.type === "checkbox" ? false : "";
    return { ...base, ...initial };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else setError("Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      {error && <Alert>{error}</Alert>}
      {fields.map((f) => {
        const err = fieldErrors[f.name]?.[0];
        const set = (v: string | boolean) => setValues((prev) => ({ ...prev, [f.name]: v }));
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(e.target.checked)} />
              {f.label}
            </label>
          );
        }
        return (
          <Field key={f.name} label={f.label} error={err} help={f.help} required={f.required}>
            {(id) =>
              f.type === "select" && f.optionsFrom ? (
                <DependentSelect id={id} def={f} parentValue={String(values[f.optionsFrom.field] ?? "")} value={String(values[f.name])} onChange={set} />
              ) : f.type === "select" ? (
                <select id={id} className={inputClass} required={f.required} value={String(values[f.name])} onChange={(e) => set(e.target.value)}>
                  <option value="">{f.required ? "Select…" : "None"}</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea id={id} rows={3} className={inputClass} required={f.required} placeholder={f.placeholder} value={String(values[f.name])} onChange={(e) => set(e.target.value)} />
              ) : (
                <input
                  id={id}
                  type={f.type ?? "text"}
                  step={f.step}
                  className={inputClass}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={String(values[f.name])}
                  onChange={(e) => set(e.target.value)}
                />
              )
            }
          </Field>
        );
      })}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
