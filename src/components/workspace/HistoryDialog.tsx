"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Undo2 } from "lucide-react";
import type { HistoryEntry } from "./types";

function timeAgo(unix: number) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - unix));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type HistoryDialogProps = {
  projectId: string;
  busy: boolean;
  onClose: () => void;
  onRestored: () => Promise<void>;
};

/**
 * Restorable checkpoints. Every build snapshots the files it is about to
 * change, so "Restore" rolls the project back to just before that build —
 * and the restore itself is checkpointed too, making it undoable.
 */
export default function HistoryDialog({
  projectId,
  busy,
  onClose,
  onRestored,
}: HistoryDialogProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [restoring, setRestoring] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/projects/${projectId}/history`);
      if (cancelled) return;
      if (!response.ok) {
        setError("Could not load history");
        setEntries([]);
        return;
      }
      const payload = (await response.json()) as { entries: HistoryEntry[] };
      if (!cancelled) setEntries(payload.entries ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function restore(runId: string) {
    if (busy || restoring) return;
    setRestoring(runId);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Restore failed");
      }
      await onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setRestoring("");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <h2>
          <History size={15} style={{ display: "inline", marginRight: 8 }} />
          Version history
        </h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Every build checkpoints your files before changing them. Restoring rolls the files back
          to that point — your chat stays, and the restore itself becomes a new checkpoint.
        </p>

        {error && <div className="chat-error">{error}</div>}

        {entries === null ? (
          <div className="data-empty" style={{ minHeight: 80 }}>
            <Loader2 size={16} className="chip-spinner" />
          </div>
        ) : entries.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No checkpoints yet — they appear after the next build.
          </p>
        ) : (
          <div className="history-list">
            {entries.map((entry) => (
              <div className="history-row" key={entry.id}>
                <div className="history-meta">
                  <span className="history-summary">
                    {entry.summary || "(no summary)"}
                  </span>
                  <span className="muted">
                    {timeAgo(entry.createdAt)} · {entry.fileCount}{" "}
                    {entry.fileCount === 1 ? "file" : "files"} before this change
                    {entry.status === "error" ? " · build failed" : ""}
                    {entry.status === "cancelled" ? " · build stopped" : ""}
                  </span>
                </div>
                <button
                  className="btn-ghost"
                  disabled={busy || Boolean(restoring)}
                  onClick={() => void restore(entry.id)}
                  type="button"
                >
                  {restoring === entry.id ? (
                    <Loader2 size={13} className="chip-spinner" />
                  ) : (
                    <Undo2 size={13} />
                  )}
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
