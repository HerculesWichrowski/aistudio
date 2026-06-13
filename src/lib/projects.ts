import { nanoid } from "nanoid";
import { turso } from "./db";

export type Visibility = "private" | "public" | "restricted";

export type Project = {
  id: string;
  name: string;
  description: string;
  model: string;
  user_id: string;
  visibility: Visibility;
  shared_emails: string;
  app_data: string;
  openrouter_api_key: string;
  created_at: number;
  updated_at: number;
};

export const DEFAULT_MODEL = "openrouter/free";

export { safePath } from "./paths";

export async function listProjects(userId: string) {
  const r = await turso(
    "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
    [userId]
  );
  return r.rows ?? [];
}

export async function getProject(id: string) {
  const r = await turso("SELECT * FROM projects WHERE id = ?", [id]);
  return (r.rows?.[0] as unknown as Project) ?? null;
}

export async function createProject(
  userId: string,
  name: string,
  description = "",
  model = DEFAULT_MODEL
) {
  const id = nanoid();
  await turso(
    "INSERT INTO projects (id, name, description, model, user_id) VALUES (?, ?, ?, ?, ?)",
    [id, name, description, model, userId]
  );
  return { id, name, description, model };
}

export async function updateProject(id: string, fields: Record<string, string>) {
  const allowed = [
    "name",
    "description",
    "model",
    "visibility",
    "shared_emails",
    "openrouter_api_key",
    "app_data",
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return;

  const sets = entries.map(([key]) => `${key} = ?`).join(", ");
  const vals = [...entries.map(([, value]) => value), id];
  await turso(`UPDATE projects SET ${sets}, updated_at = unixepoch() WHERE id = ?`, vals);
}

export async function deleteProject(id: string) {
  await turso("DELETE FROM messages WHERE project_id = ?", [id]);
  await turso("DELETE FROM files WHERE project_id = ?", [id]);
  await turso("DELETE FROM build_runs WHERE project_id = ?", [id]);
  await turso("DELETE FROM projects WHERE id = ?", [id]);
}

/** Copies a project (files, model, app data — not chat history) for the same owner. */
export async function duplicateProject(source: Project, name?: string) {
  const id = nanoid();
  await turso(
    `INSERT INTO projects (id, name, description, model, user_id, app_data, openrouter_api_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      (name ?? `${source.name} copy`).slice(0, 80),
      source.description,
      source.model,
      source.user_id,
      source.app_data ?? "{}",
      source.openrouter_api_key ?? "",
    ]
  );

  const files = await listFiles(source.id);
  for (const file of files as unknown as { path: string; content: string }[]) {
    await upsertFile(id, file.path, file.content);
  }
  return id;
}

export async function listMessages(projectId: string) {
  const r = await turso(
    "SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC, id ASC",
    [projectId]
  );
  return r.rows ?? [];
}

export async function addMessage(projectId: string, role: string, content: string) {
  const id = nanoid();
  await turso(
    "INSERT INTO messages (id, project_id, role, content) VALUES (?, ?, ?, ?)",
    [id, projectId, role, content]
  );
  await turso("UPDATE projects SET updated_at = unixepoch() WHERE id = ?", [projectId]);
  return { id, role, content };
}

export async function truncateMessagesFrom(
  projectId: string,
  messageId: string,
  includeMessage = false
) {
  const anchor = await turso(
    "SELECT created_at, id FROM messages WHERE id = ? AND project_id = ?",
    [messageId, projectId]
  );
  const row = anchor.rows?.[0] as unknown as { created_at: number; id: string } | undefined;
  if (!row) return 0;

  const result = await turso(
    includeMessage
      ? `DELETE FROM messages
         WHERE project_id = ?
           AND (created_at > ? OR (created_at = ? AND id >= ?))`
      : `DELETE FROM messages
         WHERE project_id = ?
           AND (created_at > ? OR (created_at = ? AND id > ?))`,
    [projectId, row.created_at, row.created_at, row.id]
  );

  await turso("UPDATE projects SET updated_at = unixepoch() WHERE id = ?", [projectId]);
  return result.rows?.length ?? 0;
}

export async function listFiles(projectId: string) {
  const r = await turso(
    "SELECT * FROM files WHERE project_id = ? ORDER BY path ASC",
    [projectId]
  );
  return r.rows ?? [];
}

export async function upsertFile(projectId: string, path: string, content: string) {
  const id = nanoid();
  await turso(
    `INSERT INTO files (id, project_id, path, content)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, path)
     DO UPDATE SET content = excluded.content, updated_at = unixepoch()`,
    [id, projectId, path, content]
  );
  await turso("UPDATE projects SET updated_at = unixepoch() WHERE id = ?", [projectId]);
}

export async function deleteFile(projectId: string, path: string) {
  await turso("DELETE FROM files WHERE project_id = ? AND path = ?", [projectId, path]);
}

/** Replaces the whole virtual file tree (used by history restore). */
export async function replaceProjectFiles(
  projectId: string,
  files: { path: string; content: string }[]
) {
  await turso("DELETE FROM files WHERE project_id = ?", [projectId]);
  for (const file of files) {
    await upsertFile(projectId, file.path, file.content);
  }
}

export function parseSharedEmails(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

export function canViewApp(
  project: Project,
  viewer: { userId: string | null; email: string | null }
) {
  if (project.visibility === "public") return true;
  if (viewer.userId && viewer.userId === project.user_id) return true;
  if (project.visibility === "restricted" && viewer.email) {
    return parseSharedEmails(project.shared_emails ?? "").includes(viewer.email.toLowerCase());
  }
  return false;
}
