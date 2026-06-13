"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, Trash2 } from "lucide-react";
import { loadProjectRules, type AppData, type FieldRule } from "@/lib/rules";
import type { ProjectFile } from "./types";

function DataRowEditor({
  row,
  fields,
  onSave,
  onCancel,
}: {
  row: Record<string, unknown>;
  fields: Record<string, FieldRule>;
  onSave: (next: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...row });
  const [error, setError] = useState("");

  function setField(name: string, value: unknown) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function submit() {
    try {
      onSave({ ...draft, id: row.id });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid row");
    }
  }

  const fieldNames = Object.keys(fields);
  const extras = Object.keys(row).filter((key) => key !== "id" && !fieldNames.includes(key));

  return (
    <div className="data-row-editor">
      <div className="data-fields">
        <label className="data-field">
          <span className="label">id</span>
          <input className="input mono" value={String(row.id)} disabled />
        </label>
        {fieldNames.map((name) => {
          const rule = fields[name];
          const value = draft[name];
          if (rule.type === "boolean") {
            return (
              <label className="data-field" key={name}>
                <span className="label">{name}</span>
                <select
                  className="select"
                  value={value === true ? "true" : value === false ? "false" : ""}
                  onChange={(event) => setField(name, event.target.value === "true")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
            );
          }
          return (
            <label className="data-field" key={name}>
              <span className="label">
                {name}
                {rule.required ? " *" : ""}
              </span>
              <input
                className="input"
                type={rule.type === "number" ? "number" : "text"}
                value={value == null ? "" : String(value)}
                onChange={(event) =>
                  setField(
                    name,
                    rule.type === "number"
                      ? event.target.value === ""
                        ? undefined
                        : Number(event.target.value)
                      : event.target.value
                  )
                }
              />
            </label>
          );
        })}
        {extras.map((name) => (
          <label className="data-field" key={name}>
            <span className="label">{name}</span>
            <input
              className="input mono"
              value={draft[name] == null ? "" : JSON.stringify(draft[name])}
              onChange={(event) => {
                try {
                  setField(name, JSON.parse(event.target.value));
                } catch {
                  setField(name, event.target.value);
                }
              }}
            />
          </label>
        ))}
      </div>
      {error && <p className="chat-error" style={{ margin: 0 }}>{error}</p>}
      <div className="data-row-actions">
        <button className="btn-ghost" type="button" style={{ minHeight: 26, fontSize: 12 }} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" type="button" style={{ minHeight: 26, fontSize: 12 }} onClick={submit}>
          Save
        </button>
      </div>
    </div>
  );
}

export default function DataPanel({
  projectId,
  files,
  onChanged,
}: {
  projectId: string;
  files: ProjectFile[];
  onChanged: () => void;
}) {
  const [data, setData] = useState<AppData>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingRow, setEditingRow] = useState<{ table: string; id: string } | null>(null);

  const rules = useMemo(() => loadProjectRules(files).rules, [files]);

  // Refreshes are silent (no spinner) — `loading` only covers the first load.
  const loadData = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/data`);
    if (response.ok) {
      const payload = await response.json();
      setData(payload.data ?? {});
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    fetch(`/api/projects/${projectId}/data`)
      .then(async (response) => {
        if (stale || !response.ok) return;
        const payload = await response.json();
        if (!stale) setData(payload.data ?? {});
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [projectId]);

  async function saveRow(table: string, row: Record<string, unknown>) {
    await fetch(`/api/projects/${projectId}/data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id: row.id, row }),
    });
    await loadData();
    onChanged();
  }

  async function deleteRow(table: string, rowId: string) {
    await fetch(`/api/projects/${projectId}/data?table=${encodeURIComponent(table)}&id=${encodeURIComponent(rowId)}`, {
      method: "DELETE",
    });
    await loadData();
    onChanged();
  }

  if (!rules?.tables || Object.keys(rules.tables).length === 0) {
    return (
      <div className="data-empty">
        <Database size={28} strokeWidth={1.5} />
        <p>No database yet.</p>
        <p className="muted">Ask the builder to &ldquo;add a database&rdquo; — it will create <code>database.rules.json</code> and wire <code>window.db</code> in your app.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="data-empty">
        <span className="thinking">
          <i /> <i /> <i />
        </span>
      </div>
    );
  }

  return (
    <div className="data-panel">
      {Object.keys(rules.tables).map((table) => {
        const rows = data[table] ?? [];
        const open = expanded[table] ?? true;
        return (
          <div className="data-table" key={table}>
            <button
              className="data-table-head"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [table]: !open }))}
            >
              {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span className="mono">{table}</span>
              <span className="muted">[{rows.length}]</span>
            </button>
            {open && (
              <div className="data-rows">
                {rows.length === 0 ? (
                  <div className="data-row-empty muted">No rows</div>
                ) : (
                  rows.map((row) => {
                    const isEditing =
                      editingRow?.table === table && editingRow.id === String(row.id);
                    const tableFields = rules.tables?.[table]?.fields ?? {};

                    return (
                      <div className="data-row" key={String(row.id)}>
                        {isEditing ? (
                          <DataRowEditor
                            fields={tableFields}
                            onCancel={() => setEditingRow(null)}
                            onSave={(next) => {
                              void saveRow(table, next).then(() => setEditingRow(null));
                            }}
                            row={row}
                          />
                        ) : (
                          <>
                            <pre className="data-row-json">{JSON.stringify(row, null, 2)}</pre>
                            <div className="data-row-actions">
                              <button
                                className="btn-ghost"
                                type="button"
                                style={{ minHeight: 26, fontSize: 12 }}
                                onClick={() => setEditingRow({ table, id: String(row.id) })}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                type="button"
                                style={{ width: 26, minHeight: 26 }}
                                onClick={() => void deleteRow(table, String(row.id))}
                                title="Delete row"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
