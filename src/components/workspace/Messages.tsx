"use client";

import { useMemo } from "react";
import { FileCode, Loader2, Pencil, RotateCw } from "lucide-react";
import {
  parseStoredFileOps,
  type BuildFileStatus,
  type StoredFileOp,
} from "@/lib/build-stream-client";
import type { StreamPhase } from "./types";

function chipClassForStatus(status: BuildFileStatus["status"] | StoredFileOp["status"]) {
  if (status === "start") return "chip chip-working";
  if (status === "error") return "chip chip-error";
  if (status === "done" || status === "deleted") return "chip chip-done";
  return "chip";
}

export function FileChip({
  path,
  status,
  error,
  deleted,
  onOpen,
}: {
  path: string;
  status: BuildFileStatus["status"] | StoredFileOp["status"];
  error?: string;
  deleted?: boolean;
  onOpen?: (path: string) => void;
}) {
  const label = (
    <>
      {status === "start" ? (
        <Loader2 size={11} className="chip-spinner" />
      ) : (
        <FileCode size={11} />
      )}
      {deleted ? "removed " : ""}
      {path}
      {status === "error" ? ` (${error ?? "failed"})` : ""}
    </>
  );

  if (!onOpen || deleted) {
    return (
      <span className={chipClassForStatus(status)} title={error}>
        {label}
      </span>
    );
  }

  return (
    <button
      className={`${chipClassForStatus(status)} chip-button`}
      onClick={() => onOpen(path)}
      title={error ?? `Open ${path}`}
      type="button"
    >
      {label}
    </button>
  );
}

export function AssistantMessage({
  content,
  streaming,
  buildEvents = [],
  phase = "idle",
  onFileClick,
}: {
  content: string;
  streaming?: boolean;
  buildEvents?: BuildFileStatus[];
  phase?: StreamPhase;
  onFileClick?: (path: string) => void;
}) {
  const parsed = useMemo(() => parseStoredFileOps(content), [content]);
  const text = parsed.text;
  const storedOps = parsed.ops;
  const showLiveEvents = buildEvents.length > 0;
  const fileItems = showLiveEvents
    ? buildEvents.map((event) => ({
        key: event.path,
        path: event.path,
        status: event.status,
        error: event.error,
        deleted: event.status === "deleted",
      }))
    : storedOps.map((op) => ({
        key: op.path,
        path: op.path,
        status: op.status ?? "done",
        error: op.error,
        deleted: op.action === "delete" || op.status === "deleted",
      }));

  const planning = phase === "planning";
  const building = phase === "building";

  return (
    <div className="msg assistant">
      {text ? <div className="msg-body">{text}</div> : null}
      {fileItems.length > 0 && (
        <div className="chips">
          {fileItems.map((item) => (
            <FileChip
              deleted={item.deleted}
              error={item.error}
              key={item.key}
              onOpen={onFileClick}
              path={item.path}
              status={item.status}
            />
          ))}
        </div>
      )}
      {planning && !text && (
        <div className="msg-status">
          <Loader2 size={13} className="chip-spinner" />
          <span>Thinking…</span>
        </div>
      )}
      {building && fileItems.length === 0 && (
        <div className="msg-status">
          <Loader2 size={13} className="chip-spinner" />
          <span>Working on your app…</span>
        </div>
      )}
      {streaming && planning && text && (
        <span className="stream-cursor" aria-hidden />
      )}
    </div>
  );
}

export function UserMessage({
  content,
  disabled,
  onEdit,
  onRedo,
}: {
  content: string;
  disabled?: boolean;
  onEdit: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="msg user">
      <div className="msg-body">{content}</div>
      <div className="msg-actions">
        <button
          className="msg-action"
          disabled={disabled}
          onClick={onEdit}
          title="Edit message"
          type="button"
        >
          <Pencil size={11} />
          Edit
        </button>
        <button
          className="msg-action"
          disabled={disabled}
          onClick={onRedo}
          title="Redo from here"
          type="button"
        >
          <RotateCw size={11} />
          Redo
        </button>
      </div>
    </div>
  );
}
