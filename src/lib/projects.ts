import { nanoid } from "nanoid";
import { turso } from "./db";

export async function listProjects() {
  const r = await turso("SELECT * FROM projects ORDER BY updated_at DESC", []);
  return r.rows ?? [];
}

export async function getProject(id: string) {
  const r = await turso("SELECT * FROM projects WHERE id = ?", [id]);
  return r.rows?.[0] ?? null;
}

export async function createProject(name: string, description = "") {
  const id = nanoid();
  await turso(
    "INSERT INTO projects (id, name, description) VALUES (?, ?, ?)",
    [id, name, description]
  );
  return { id, name, description };
}

export async function updateProject(id: string, fields: Record<string, string>) {
  const allowed = ["name", "description", "model"];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return;

  const sets = entries.map(([key]) => `${key} = ?`).join(", ");
  const vals = [...entries.map(([, value]) => value), id];
  await turso(`UPDATE projects SET ${sets}, updated_at = unixepoch() WHERE id = ?`, vals);
}

export async function deleteProject(id: string) {
  await turso("DELETE FROM messages WHERE project_id = ?", [id]);
  await turso("DELETE FROM files WHERE project_id = ?", [id]);
  await turso("DELETE FROM projects WHERE id = ?", [id]);
}

export async function listMessages(projectId: string) {
  const r = await turso(
    "SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC",
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
  await turso(
    "UPDATE projects SET updated_at = unixepoch() WHERE id = ?",
    [projectId]
  );
  return { id, role, content };
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
  await turso(
    "UPDATE projects SET updated_at = unixepoch() WHERE id = ?",
    [projectId]
  );
}

export async function deleteFile(projectId: string, path: string) {
  await turso("DELETE FROM files WHERE project_id = ? AND path = ?", [projectId, path]);
}
