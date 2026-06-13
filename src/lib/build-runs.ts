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

/** A restorable point in project history: the files as they were before a run. */
export type HistoryEntry = {
  id: string;
  summary: string;
  status: BuildRun["status"];
  fileCount: number;
  createdAt: number;
};

type SnapshotFile = { path: string; content: string };

// Polling endpoints hit these queries every ~450ms; keep files_snapshot
// (the whole project, as JSON) out of them.
const RUN_COLUMNS =
  "id, project_id, status, phase, stream_chat, events_json, error, created_at, updated_at";

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
  const result = await turso(`SELECT ${RUN_COLUMNS} FROM build_runs WHERE id = ?`, [runId]);
  return (result.rows?.[0] as unknown as BuildRun) ?? null;
}

export async function getActiveBuildRun(projectId: string) {
  await initDB();
  const result = await turso(
    `SELECT ${RUN_COLUMNS} FROM build_runs
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

/** Stores the project's files as they were BEFORE this run changed anything. */
export async function saveRunFilesSnapshot(runId: string, files: SnapshotFile[]) {
  await initDB();
  await turso("UPDATE build_runs SET files_snapshot = ? WHERE id = ?", [
    JSON.stringify(files.map(({ path, content }) => ({ path, content }))),
    runId,
  ]);
}

export async function getRunFilesSnapshot(runId: string): Promise<SnapshotFile[] | null> {
  await initDB();
  const result = await turso("SELECT files_snapshot FROM build_runs WHERE id = ?", [runId]);
  const raw = (result.rows?.[0] as { files_snapshot?: string } | undefined)?.files_snapshot;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SnapshotFile[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Finished runs that captured a pre-build snapshot, newest first. */
export async function listRestorableRuns(projectId: string, limit = 30): Promise<HistoryEntry[]> {
  await initDB();
  const result = await turso(
    `SELECT id, status, stream_chat, files_snapshot, created_at FROM build_runs
     WHERE project_id = ? AND status != 'running' AND files_snapshot != ''
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [projectId, limit]
  );

  const entries: HistoryEntry[] = [];
  for (const row of (result.rows ?? []) as unknown as (BuildRun & { files_snapshot: string })[]) {
    let fileCount = 0;
    try {
      const files = JSON.parse(row.files_snapshot) as SnapshotFile[];
      fileCount = Array.isArray(files) ? files.length : 0;
    } catch {}
    entries.push({
      id: row.id,
      summary: (row.stream_chat ?? "").trim().split("\n")[0]?.slice(0, 200) ?? "",
      status: row.status,
      fileCount,
      createdAt: row.created_at,
    });
  }
  return entries;
}

/** Records a synthetic, restorable run (used to checkpoint before a restore). */
export async function recordCheckpointRun(
  projectId: string,
  summary: string,
  files: SnapshotFile[]
) {
  await initDB();
  const id = nanoid();
  await turso(
    `INSERT INTO build_runs (id, project_id, status, phase, stream_chat, events_json, error, files_snapshot)
     VALUES (?, ?, 'done', 'idle', ?, '[]', '', ?)`,
    [id, projectId, summary, JSON.stringify(files.map(({ path, content }) => ({ path, content })))]
  );
  return id;
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
