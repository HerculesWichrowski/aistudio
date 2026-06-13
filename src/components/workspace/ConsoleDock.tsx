"use client";

import { ChevronDown, ChevronUp, Trash2, Wrench } from "lucide-react";
import type { ConsoleEntry } from "./types";

type ConsoleDockProps = {
  entries: ConsoleEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onFixErrors: () => void;
  fixDisabled: boolean;
};

export default function ConsoleDock({
  entries,
  open,
  onToggle,
  onClear,
  onFixErrors,
  fixDisabled,
}: ConsoleDockProps) {
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  return (
    <div className="console">
      <div className="console-head">
        <button
          className="btn-icon"
          style={{ width: 22, minHeight: 22 }}
          onClick={onToggle}
          title={open ? "Collapse console" : "Expand console"}
          type="button"
        >
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <span>Console</span>
        <span className={`count ${errorCount > 0 ? "has-errors" : ""}`}>
          {errorCount > 0 ? errorCount : entries.length}
        </span>
        <span className="ws-spacer" />
        {errorCount > 0 && (
          <button
            className="btn-ghost"
            style={{ minHeight: 24, fontSize: 12 }}
            onClick={onFixErrors}
            disabled={fixDisabled}
            type="button"
          >
            <Wrench size={12} />
            Fix {errorCount} {errorCount === 1 ? "error" : "errors"} with AI
          </button>
        )}
        {entries.length > 0 && (
          <button
            className="btn-icon"
            style={{ width: 24, minHeight: 24 }}
            onClick={onClear}
            title="Clear console"
            type="button"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="console-body">
          {entries.length === 0 ? (
            <div className="console-empty">Console output from the preview shows up here.</div>
          ) : (
            entries.map((entry) => (
              <div className={`console-line ${entry.level}`} key={entry.id}>
                {entry.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
