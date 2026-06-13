"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

type ConfirmDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  error = "",
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose]);

  return (
    <div className="modal-backdrop" onClick={loading ? undefined : onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          {description}
        </p>
        {error ? <div className="chat-error">{error}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-ghost" disabled={loading} onClick={onClose} type="button">
            {cancelLabel}
          </button>
          <button
            className={destructive ? "btn btn-danger" : "btn"}
            disabled={loading}
            onClick={() => void onConfirm()}
            type="button"
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
