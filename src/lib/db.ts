import { createClient, type Client, type InArgs } from "@libsql/client";

let _client: Client | null = null;

function client() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("Missing TURSO_DATABASE_URL");
  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}

export async function turso(sql: string, args: InArgs = []) {
  const result = await client().execute({ sql, args });
  return { rows: result.rows };
}

let ready: Promise<void> | null = null;

export function initDB() {
  ready ??= migrate();
  return ready;
}

async function migrate() {
  await turso(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT DEFAULT 'openrouter/free',
    app_data TEXT DEFAULT '{}',
    openrouter_api_key TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    visibility TEXT DEFAULT 'private',
    shared_emails TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);
  await turso(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )`);
  await turso(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);
  await turso(`CREATE UNIQUE INDEX IF NOT EXISTS files_project_path_idx ON files (project_id, path)`);

  // Columns added after the original schema; ignore "duplicate column" on existing DBs.
  for (const column of [
    "user_id TEXT DEFAULT ''",
    "visibility TEXT DEFAULT 'private'",
    "shared_emails TEXT DEFAULT ''",
    "app_data TEXT DEFAULT '{}'",
    "openrouter_api_key TEXT DEFAULT ''",
  ]) {
    try {
      await turso(`ALTER TABLE projects ADD COLUMN ${column}`);
    } catch {}
  }
}
