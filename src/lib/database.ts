import { nanoid } from "nanoid";
import { turso } from "./db";

export const DATABASE_RULES_PATH = "database.rules.json";

export type FieldRule = {
  type?: "string" | "number" | "boolean";
  required?: boolean;
  default?: unknown;
};

export type DatabaseRules = {
  tables?: Record<
    string,
    {
      fields?: Record<string, FieldRule>;
    }
  >;
};

export type AppData = Record<string, Record<string, unknown>[]>;

export function normalizeRulesPath(path: string) {
  return path.replace(/^\.\//, "").replace(/^\//, "").trim();
}

export function findRulesFile(files: { path: string; content?: unknown }[]) {
  return files.find((file) => normalizeRulesPath(file.path) === DATABASE_RULES_PATH);
}

function stripJsonComments(raw: string) {
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function tryParseJson(raw: string) {
  const attempts = [raw, stripJsonComments(raw)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {}
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      return JSON.parse(stripJsonComments(fenced)) as unknown;
    } catch {}
  }

  return null;
}

function normalizeTables(parsed: Record<string, unknown>) {
  if (parsed.tables && typeof parsed.tables === "object" && !Array.isArray(parsed.tables)) {
    return parsed.tables as DatabaseRules["tables"];
  }

  if (parsed.schema && typeof parsed.schema === "object" && !Array.isArray(parsed.schema)) {
    return parsed.schema as DatabaseRules["tables"];
  }

  const reserved = new Set(["version", "$schema", "comment", "description", "name"]);
  const tables: NonNullable<DatabaseRules["tables"]> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (reserved.has(key)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    tables[key] = value as { fields?: Record<string, FieldRule> };
  }

  return Object.keys(tables).length > 0 ? tables : null;
}

export function parseRules(raw: string | null | undefined): DatabaseRules | null {
  if (!raw?.trim()) return null;

  const cleaned = raw.trim().replace(/^\uFEFF/, "");
  const parsed = tryParseJson(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const tables = normalizeTables(parsed as Record<string, unknown>);
  if (!tables || Object.keys(tables).length === 0) return null;

  return { tables };
}

export function fileContent(file: { content?: unknown } | undefined) {
  if (!file) return "";
  const raw = file.content;
  if (typeof raw === "string") return raw;
  if (raw == null) return "";
  return String(raw);
}

export function loadProjectRules(files: { path: string; content?: unknown }[]) {
  const rulesFile = findRulesFile(files);
  const rules = parseRules(fileContent(rulesFile));
  return { rulesFile, rules };
}

export function parseAppData(raw: string | null | undefined): AppData {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as AppData;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getAppData(projectId: string): Promise<AppData> {
  const r = await turso("SELECT app_data FROM projects WHERE id = ?", [projectId]);
  const row = r.rows?.[0] as { app_data?: string } | undefined;
  return parseAppData(row?.app_data);
}

export async function setAppData(projectId: string, data: AppData) {
  await turso("UPDATE projects SET app_data = ?, updated_at = unixepoch() WHERE id = ?", [
    JSON.stringify(data),
    projectId,
  ]);
}

function tableExists(rules: DatabaseRules | null, table: string) {
  return Boolean(rules?.tables?.[table]);
}

function validateRow(
  rules: DatabaseRules | null,
  table: string,
  row: Record<string, unknown>,
  partial = false
) {
  if (!tableExists(rules, table)) {
    throw new Error(`Unknown table "${table}"`);
  }

  const fields = rules!.tables![table].fields ?? {};
  const output: Record<string, unknown> = { ...row };

  for (const [name, rule] of Object.entries(fields)) {
    const value = output[name];
    if (value === undefined || value === null) {
      if (!partial && rule.required && rule.default === undefined) {
        throw new Error(`Missing required field "${name}"`);
      }
      if (value === undefined && rule.default !== undefined) {
        output[name] = rule.default;
      }
      continue;
    }

    if (rule.type === "string" && typeof value !== "string") {
      throw new Error(`Field "${name}" must be a string`);
    }
    if (rule.type === "number" && typeof value !== "number") {
      throw new Error(`Field "${name}" must be a number`);
    }
    if (rule.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Field "${name}" must be a boolean`);
    }
  }

  return output;
}

export async function runDataOperation(
  projectId: string,
  rules: DatabaseRules | null,
  op: {
    action: string;
    table?: string;
    id?: string;
    row?: Record<string, unknown>;
    patch?: Record<string, unknown>;
  }
) {
  const data = await getAppData(projectId);
  const table = op.table?.trim();
  if (!table) throw new Error("Missing table");

  if (op.action === "list") {
    if (!tableExists(rules, table)) throw new Error(`Unknown table "${table}"`);
    return data[table] ?? [];
  }

  if (op.action === "get") {
    if (!op.id) throw new Error("Missing id");
    const rows = data[table] ?? [];
    const row = rows.find((entry) => entry.id === op.id);
    if (!row) throw new Error("Row not found");
    return row;
  }

  if (op.action === "insert") {
    const row = validateRow(rules, table, { ...(op.row ?? {}), id: nanoid() });
    const rows = [...(data[table] ?? []), row];
    data[table] = rows;
    await setAppData(projectId, data);
    return row;
  }

  if (op.action === "update") {
    if (!op.id) throw new Error("Missing id");
    const rows = data[table] ?? [];
    const index = rows.findIndex((entry) => entry.id === op.id);
    if (index === -1) throw new Error("Row not found");
    const merged = { ...rows[index], ...(op.patch ?? op.row ?? {}) };
    rows[index] = validateRow(rules, table, merged as Record<string, unknown>, true);
    data[table] = rows;
    await setAppData(projectId, data);
    return rows[index];
  }

  if (op.action === "delete") {
    if (!op.id) throw new Error("Missing id");
    const rows = data[table] ?? [];
    const next = rows.filter((entry) => entry.id !== op.id);
    if (next.length === rows.length) throw new Error("Row not found");
    data[table] = next;
    await setAppData(projectId, data);
    return { ok: true };
  }

  throw new Error(`Unknown action "${op.action}"`);
}
