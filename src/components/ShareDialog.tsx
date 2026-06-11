"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  projectId: string;
  visibility: string;
  sharedEmails: string;
  onClose: () => void;
  onSaved: (visibility: string, sharedEmails: string) => void;
};

const OPTIONS = [
  { value: "private", title: "Private", text: "Only you can open the app." },
  { value: "restricted", title: "Specific people", text: "Only the emails you list below (they sign in to view)." },
  { value: "public", title: "Public", text: "Anyone with the link can open the app." },
];

export default function ShareDialog({ projectId, visibility, sharedEmails, onClose, onSaved }: Props) {
  const [value, setValue] = useState(visibility || "private");
  const [emails, setEmails] = useState(sharedEmails || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = typeof window !== "undefined" ? `${window.location.origin}/p/${projectId}` : `/p/${projectId}`;

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: value, shared_emails: emails }),
    });
    setSaving(false);
    onSaved(value, emails);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>Share app</h2>

        <div style={{ display: "grid", gap: 8 }}>
          {OPTIONS.map((option) => (
            <label
              className={`radio-row ${value === option.value ? "selected" : ""}`}
              key={option.value}
            >
              <input
                type="radio"
                name="visibility"
                checked={value === option.value}
                onChange={() => setValue(option.value)}
              />
              <span>
                <strong>{option.title}</strong>
                <span>{option.text}</span>
              </span>
            </label>
          ))}
        </div>

        {value === "restricted" && (
          <div>
            <span className="label">Allowed emails (comma or newline separated)</span>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="friend@example.com, teammate@example.com"
            />
          </div>
        )}

        <div>
          <span className="label">App link</span>
          <div className="share-link-row">
            <input className="input" readOnly value={link} onFocus={(event) => event.target.select()} />
            <button className="btn-ghost" onClick={copyLink} type="button">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn" onClick={save} disabled={saving} type="button">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
