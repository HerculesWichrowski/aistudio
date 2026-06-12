import { nanoid } from "nanoid";
import { initDB, turso } from "./db";

export type BuildRunEvent = {
  path: string;
  status: "start" | "done" | "deleted" | "error";
  error?: string;
  draft?: string;
};

export type BuildRun = {
  id: string;
  project_id: string;
  status: "running" | "done" | "error" | "cancelled";
  phase: "planning" | "building" | "idle";
  stream_chat: string;
  events_json: string;
  error: string;
  created_at: number;
  updated_at: number;
};

export type BuildRunSnapshot = {
  id: string;
  projectId: string;
  status: BuildRun["status"];
  phase: BuildRun["phase"];
  streamChat: string;
  events: BuildRunEvent[];
  error: string;
  updatedAt: number;
};

function parseEvents(raw: string): BuildRunEvent[] {
  try {
    const parsed = JSON.parse(raw) as BuildRunEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toBuildRunSnapshot(run: BuildRun): BuildRunSnapshot {
  return {
    id: run.id,
    projectId: run.project_id,
    status: run.status,
    phase: run.phase,
    streamChat: run.stream_chat,
    events: parseEvents(run.events_json),
    error: run.error,
    updatedAt: run.updated_at,
  };
}

export async function createBuildRun(projectId: string) {
  await initDB();
  const id = nanoid();
  await turso(
    `INSERT INTO build_runs (id, project_id, status, phase, stream_chat, events_json, error)
     VALUES (?, ?, 'running', 'planning', '', '[]', '')`,
    [id, projectId]
  );
  return id;
}

export async function getBuildRun(runId: string) {
  await initDB();
  const result = await turso("SELECT * FROM build_runs WHERE id = ?", [runId]);
  return (result.rows?.[0] as unknown as BuildRun) ?? null;
}

export async function getActiveBuildRun(projectId: string) {
  await initDB();
  const result = await turso(
    `SELECT * FROM build_runs
     WHERE project_id = ? AND status = 'running'
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );
  return (result.rows?.[0] as unknown as BuildRun) ?? null;
}

export async function patchBuildRun(
  runId: string,
  patch: Partial<{
    status: BuildRun["status"];
    phase: BuildRun["phase"];
    streamChat: string;
    events: BuildRunEvent[];
    error: string;
  }>
) {
  await initDB();
  const sets: string[] = ["updated_at = unixepoch()"];
  const args: (string | number)[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  if (patch.phase !== undefined) {
    sets.push("phase = ?");
    args.push(patch.phase);
  }
  if (patch.streamChat !== undefined) {
    sets.push("stream_chat = ?");
    args.push(patch.streamChat);
  }
  if (patch.events !== undefined) {
    sets.push("events_json = ?");
    args.push(JSON.stringify(patch.events));
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    args.push(patch.error);
  }

  args.push(runId);
  await turso(`UPDATE build_runs SET ${sets.join(", ")} WHERE id = ?`, args);
}

export function mergeBuildEvent(events: BuildRunEvent[], event: BuildRunEvent) {
  const next = [...events];
  const index = next.findIndex((entry) => entry.path === event.path);
  if (index >= 0) {
    const merged = { ...next[index], ...event };
    if (event.draft === undefined && next[index].draft && event.status !== "start") {
      delete merged.draft;
    }
    next[index] = merged;
  } else {
    next.push(event);
  }
  return next;
}

export async function isRunCancelled(runId: string) {
  const run = await getBuildRun(runId);
  return !run || run.status === "cancelled";
}

export async function cancelBuildRun(runId: string) {
  await patchBuildRun(runId, { status: "cancelled", phase: "idle", error: "Stopped" });
}
