"use client";

import { useRef } from "react";
import { ArrowUp, Crosshair, Loader2, Paperclip, Square, X } from "lucide-react";
import type { InspectTarget, StreamPhase, UploadedAttachment } from "./types";

type ComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  attachments: UploadedAttachment[];
  onRemoveAttachment: (id: string) => void;
  onPickFiles: (list: FileList | null) => void;
  inspectTarget: InspectTarget | null;
  onClearInspectTarget: () => void;
  loading: boolean;
  streamPhase: StreamPhase;
  onSend: () => void;
  onStop: () => void;
};

export default function Composer({
  input,
  onInputChange,
  attachments,
  onRemoveAttachment,
  onPickFiles,
  inspectTarget,
  onClearInspectTarget,
  loading,
  streamPhase,
  onSend,
  onStop,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(input.trim() || attachments.length > 0);

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="composer-box">
        {(attachments.length > 0 || inspectTarget) && (
          <div className="composer-attachments">
            {inspectTarget && (
              <span className="upload-attachment inspect-chip" title="The next message targets this element">
                <Crosshair size={11} />
                {inspectTarget.component ?? inspectTarget.tag}
                {inspectTarget.text ? ` · “${inspectTarget.text.slice(0, 24)}${inspectTarget.text.length > 24 ? "…" : ""}”` : ""}
                <button
                  className="upload-attachment-remove"
                  onClick={onClearInspectTarget}
                  title="Clear selected element"
                  type="button"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {attachments.map((file) => (
              <span className="upload-attachment" key={file.id}>
                <Paperclip size={11} />
                {file.name}
                <button
                  className="upload-attachment-remove"
                  onClick={() => onRemoveAttachment(file.id)}
                  title="Remove attachment"
                  type="button"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={
            inspectTarget
              ? "Describe what to change about the selected element..."
              : "Add a dark mode toggle, add a database for todos..."
          }
        />
        <div className="composer-foot">
          <div className="composer-tools">
            <input
              ref={fileInputRef}
              className="composer-file-input"
              type="file"
              multiple
              onChange={(event) => onPickFiles(event.target.files)}
            />
            <button
              className="btn-icon"
              onClick={() => fileInputRef.current?.click()}
              title="Upload files"
              type="button"
            >
              <Paperclip size={14} />
            </button>
          </div>
          <div className="composer-actions">
            {loading && (
              <button className="btn-ghost btn-danger" onClick={onStop} type="button">
                <Square size={12} />
                Stop
              </button>
            )}
            <button className="btn" type="submit" disabled={loading || !canSend}>
              {loading ? (
                <>
                  <Loader2 size={14} className="chip-spinner" />
                  {streamPhase === "building" ? "Building…" : "Thinking…"}
                </>
              ) : (
                <>
                  Send
                  <ArrowUp size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
