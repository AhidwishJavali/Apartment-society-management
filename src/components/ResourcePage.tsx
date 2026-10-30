"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ClientError, type Meta, type Option } from "@/lib/client";
import { buildPayload, ResourceForm, type FieldDef, type FormValues } from "./ResourceForm";
import { Alert, Button, ConfirmDialog, EmptyState, inputClass, Modal, Pagination, Spinner, useToast } from "./ui";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };
export type FilterDef = { name: string; label: string; options: Option[]; type?: "select" } | { name: string; label: string; type: "date" };

export type ResourcePageProps<T extends { id: string | number }> = {
  title: string;
  description?: string;
  endpoint: string;
  columns: Column<T>[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  refreshKey?: number;
  summary?: (query: string, refreshKey: number) => ReactNode;
  // Create / edit
  createFields?: FieldDef[];
  createLabel?: string;
  createDefaults?: FormValues;
  editFields?: FieldDef[];
  toFormValues?: (row: T) => FormValues;
  canEdit?: (row: T) => boolean;
  // Removal (DELETE). `removeLabel` lets modules say "Deactivate" instead.
  removeLabel?: string;
  canRemove?: (row: T) => boolean;
  removeMessage?: (row: T) => string;
  rowActions?: (row: T, ctx: { reload: () => void }) => ReactNode;
  emptyHint?: string;
  headerExtra?: ReactNode;
};

export function ResourcePage<T extends { id: string | number }>(props: ResourcePageProps<T>) {
  const { endpoint, columns, filters = [], refreshKey = 0 } = props;
  const notify = useToast();

  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [reloadTick, setReloadTick] = useState(0);

  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit"; row: T } | { kind: "remove"; row: T } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = new URLSearchParams();
  if (debounced) query.set("q", debounced);
  Object.entries(filterValues).forEach(([k, v]) => v && query.set(k, v));
  const queryString = query.toString();

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const qs = new URLSearchParams(queryString);
    qs.set("page", String(page));
    api<T[]>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`)
      .then((r) => {
        if (stale) return;
        setRows(r.data);
        setMeta(r.meta ?? null);
        setError(null);
      })
      .catch((e: unknown) => !stale && setError(e instanceof ClientError ? e.message : "Failed to load data"))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [endpoint, queryString, page, refreshKey, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  async function submit(mode: "create" | "edit", row: T | undefined, values: FormValues) {
    const fields = (mode === "create" ? props.createFields : props.editFields) ?? [];
    const payload = buildPayload(fields, values, mode);
    const res =
      mode === "create"
        ? await api(endpoint, { method: "POST", json: payload })
        : await api(`${endpoint}/${row!.id}`, { method: "PATCH", json: payload });
    setDialog(null);
    notify(res.warning ?? (mode === "create" ? "Created successfully" : "Saved successfully"), res.warning ? "warning" : "success");
    reload();
  }

  async function remove(row: T) {
    setRemoving(true);
    try {
      await api(`${endpoint}/${row.id}`, { method: "DELETE" });
      notify(`${props.removeLabel ?? "Delete"} succeeded`);
      setDialog(null);
      reload();
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
      setDialog(null);
    } finally {
      setRemoving(false);
    }
  }

  const hasActions = Boolean(props.editFields || props.removeLabel || props.rowActions);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{props.title}</h1>
          {props.description && <p className="mt-1 text-sm text-slate-600">{props.description}</p>}
        </div>
        <div className="flex gap-2">
          {props.headerExtra}
          {props.createFields && <Button onClick={() => setDialog({ kind: "create" })}>{props.createLabel ?? "Add new"}</Button>}
        </div>
      </div>

      {props.summary?.(queryString, refreshKey + reloadTick)}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="search" className="sr-only">
            Search
          </label>
          <input id="search" type="search" className={`${inputClass} w-64`} placeholder={props.searchPlaceholder ?? "Search…"} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {filters.map((f) => (
          <div key={f.name}>
            <label htmlFor={`f-${f.name}`} className="mb-0.5 block text-xs text-slate-500">
              {f.label}
            </label>
            {f.type === "date" ? (
              <input id={`f-${f.name}`} type="date" className={inputClass} value={filterValues[f.name] ?? ""} onChange={(e) => { setFilterValues((v) => ({ ...v, [f.name]: e.target.value })); setPage(1); }} />
            ) : (
              <select id={`f-${f.name}`} className={inputClass} value={filterValues[f.name] ?? ""} onChange={(e) => { setFilterValues((v) => ({ ...v, [f.name]: e.target.value })); setPage(1); }}>
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {error ? (
          <div className="p-4">
            <Alert>{error}</Alert>
            <Button className="mt-3" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : loading && rows.length === 0 ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to show" hint={props.emptyHint ?? "Try changing the search or filters."} />
        ) : (
          <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c.header} scope="col" className="px-4 py-2.5 font-medium">
                      {c.header}
                    </th>
                  ))}
                  {hasActions && (
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {columns.map((c) => (
                      <td key={c.header} className={`px-4 py-2.5 ${c.className ?? ""}`}>
                        {c.cell(row)}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {props.rowActions?.(row, { reload })}
                          {props.editFields && (props.canEdit?.(row) ?? true) && (
                            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "edit", row })}>
                              Edit
                            </Button>
                          )}
                          {props.removeLabel && (props.canRemove?.(row) ?? true) && (
                            <Button size="sm" variant="danger" onClick={() => setDialog({ kind: "remove", row })}>
                              {props.removeLabel}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && rows.length > 0 && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onPage={setPage} />}
      </div>

      {dialog?.kind === "create" && props.createFields && (
        <Modal title={props.createLabel ?? "Add new"} onClose={() => setDialog(null)}>
          <ResourceForm fields={props.createFields} initial={props.createDefaults} submitLabel="Create" onSubmit={(v) => submit("create", undefined, v)} onCancel={() => setDialog(null)} />
        </Modal>
      )}
      {dialog?.kind === "edit" && props.editFields && (
        <Modal title={`Edit ${props.title.toLowerCase()}`} onClose={() => setDialog(null)}>
          <ResourceForm fields={props.editFields} initial={props.toFormValues?.(dialog.row)} submitLabel="Save changes" onSubmit={(v) => submit("edit", dialog.row, v)} onCancel={() => setDialog(null)} />
        </Modal>
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`${props.removeLabel} record?`}
          message={props.removeMessage?.(dialog.row) ?? "This action cannot be undone."}
          confirmLabel={props.removeLabel ?? "Confirm"}
          busy={removing}
          onConfirm={() => remove(dialog.row)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
