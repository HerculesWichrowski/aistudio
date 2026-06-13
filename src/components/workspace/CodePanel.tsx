"use client";

import { FormEvent } from "react";
import { FilePlus2, Save, Trash2 } from "lucide-react";
import FileTree from "./FileTree";
import type { ProjectFile } from "./types";

type CodePanelProps = {
  files: ProjectFile[];
  selectedPath: string;
  draftPath: string;
  draftContent: string;
  saving: boolean;
  onPickFile: (file: ProjectFile) => void;
  onNewFile: () => void;
  onDraftPathChange: (path: string) => void;
  onDraftContentChange: (content: string) => void;
  onSave: (event?: FormEvent) => void;
  onDeleteSelected: () => void;
};

export default function CodePanel({
  files,
  selectedPath,
  draftPath,
  draftContent,
  saving,
  onPickFile,
  onNewFile,
  onDraftPathChange,
  onDraftContentChange,
  onSave,
  onDeleteSelected,
}: CodePanelProps) {
  return (
    <div className="code-layout">
      <div className="file-list">
        <button className="file-row" onClick={onNewFile} title="New file" type="button">
          <FilePlus2 size={13} />
          <span>new file</span>
        </button>
        <FileTree files={files} onPickFile={onPickFile} selectedPath={selectedPath} />
      </div>
      <form className="editor" onSubmit={onSave}>
        <div className="editor-head">
          <input
            className="input"
            value={draftPath}
            onChange={(event) => onDraftPathChange(event.target.value)}
            placeholder="index.html"
          />
          <button className="btn-ghost" type="submit" disabled={saving || !draftPath.trim()}>
            <Save size={13} />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn-icon btn-danger"
            type="button"
            onClick={onDeleteSelected}
            disabled={!selectedPath}
            title="Delete file"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <textarea
          className="code-view"
          value={draftContent}
          onChange={(event) => onDraftContentChange(event.target.value)}
          spellCheck={false}
          placeholder="File contents…"
        />
      </form>
    </div>
  );
}
