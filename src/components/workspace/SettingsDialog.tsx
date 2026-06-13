"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { WorkspaceProject } from "./types";

type SettingsDialogProps = {
  project: WorkspaceProject;
  onClose: () => void;
  onSaveKey: (key: string | null) => Promise<void>;
  onUseCustomModel: (model: string) => void;
};

export default function SettingsDialog({
  project,
  onClose,
  onSaveKey,
  onUseCustomModel,
}: SettingsDialogProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [customModel, setCustomModel] = useState("");

  const modelLabel = (modelId: string) =>
    project.ai.models.find((model) => model.id === modelId)?.name ?? modelId;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>OpenRouter settings</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Without your own key, you can use the free auto router or pick any free model from OpenRouter.
          Add a project API key to unlock paid models, Auto, and custom model IDs.
        </p>
        <div>
          <label className="label" htmlFor="api-key">
            <KeyRound size={12} style={{ display: "inline", marginRight: 6 }} />
            Project API key
          </label>
          <input
            id="api-key"
            className="input mono"
            type="password"
            placeholder={project.ai.hasProjectKey ? "Key saved — paste new to replace" : "sk-or-..."}
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
          />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Current model: {modelLabel(project.model)}
        </p>
        {project.ai.hasProjectKey && (
          <div>
            <label className="label" htmlFor="custom-model">
              Custom model ID (optional)
            </label>
            <div className="share-link-row">
              <input
                id="custom-model"
                className="input mono"
                placeholder="provider/model-name"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
              />
              <button
                className="btn-ghost"
                type="button"
                onClick={() => customModel.trim() && onUseCustomModel(customModel.trim())}
              >
                Use
              </button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {project.ai.hasProjectKey && (
            <button className="btn-ghost btn-danger" type="button" onClick={() => void onSaveKey(null)}>
              Remove key
            </button>
          )}
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void onSaveKey(apiKeyDraft.trim())}
            disabled={!apiKeyDraft.trim()}
          >
            Save key
          </button>
        </div>
      </div>
    </div>
  );
}
