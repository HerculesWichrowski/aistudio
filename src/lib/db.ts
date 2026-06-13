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
  await turso(`CREATE TABLE IF NOT EXISTS build_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    phase TEXT NOT NULL DEFAULT 'planning',
    stream_chat TEXT NOT NULL DEFAULT '',
    events_json TEXT NOT NULL DEFAULT '[]',
    error TEXT NOT NULL DEFAULT '',
    files_snapshot TEXT NOT NULL DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);
  await turso(
    `CREATE INDEX IF NOT EXISTS build_runs_project_status_idx ON build_runs (project_id, status, created_at DESC)`
  );
  await turso(
    `CREATE INDEX IF NOT EXISTS messages_project_created_idx ON messages (project_id, created_at)`
  );

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
  try {
    await turso(`ALTER TABLE build_runs ADD COLUMN files_snapshot TEXT NOT NULL DEFAULT ''`);
  } catch {}
}
