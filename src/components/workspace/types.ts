import type { BuildFileStatus } from "@/lib/build-stream-client";

export type Message = { id: string; role: string; content: string };

export type ProjectFile = { id: string; path: string; content: string };

export type ModelOption = { id: string; name: string; free: boolean };

export type WorkspaceProject = {
  id: string;
  name: string;
  description: string;
  model: string;
  visibility: string;
  shared_emails: string;
  openrouter_api_key: string;
  ai: {
    canUseAi: boolean;
    hasProjectKey: boolean;
    defaultModel: string;
    models: ModelOption[];
  };
};

export type ConsoleEntry = { id: number; level: string; text: string };

export type UploadedAttachment = { id: string; name: string; content: string };

export type StreamPhase = "idle" | "planning" | "building";

export type BuildRunSnapshot = {
  id: string;
  projectId: string;
  status: "running" | "done" | "error" | "cancelled";
  phase: StreamPhase;
  streamChat: string;
  events: BuildFileStatus[];
  error: string;
  updatedAt: number;
};

export type HistoryEntry = {
  id: string;
  summary: string;
  status: "running" | "done" | "error" | "cancelled";
  fileCount: number;
  createdAt: number;
};

/** Element picked in the preview's inspect mode. */
export type InspectTarget = {
  component: string | null;
  tag: string;
  id: string;
  classes: string;
  text: string;
};

export type PreviewDevice = "desktop" | "tablet" | "phone";

export function describeInspectTarget(target: InspectTarget, files: ProjectFile[]) {
  const classes = target.classes
    ? `.${target.classes.trim().split(/\s+/).slice(0, 3).join(".")}`
    : "";
  const selector = `<${target.tag}${target.id ? `#${target.id}` : ""}${classes}>`;
  const componentFile =
    target.component && files.some((file) => file.path === `components/${target.component}.js`)
      ? ` (components/${target.component}.js)`
      : "";

  return [
    selector,
    target.text ? `with text "${target.text}"` : "",
    target.component && target.component !== target.tag
      ? `inside the <${target.component}> component${componentFile}`
      : componentFile,
  ]
    .filter(Boolean)
    .join(" ");
}
