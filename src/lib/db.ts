import { createClient, type InArgs } from "@libsql/client/web";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

function client() {
  if (!databaseUrl) {
    throw new Error("Missing TURSO_DATABASE_URL");
  }

  return createClient({
    url: databaseUrl,
    authToken,
  });
}

async function turso(sql: string, args: InArgs = []) {
  const result = await client().execute({ sql, args });
  return { rows: result.rows };
}

export async function initDB() {
  await turso(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT DEFAULT 'openrouter/owl-alpha',
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
}

export { turso };
