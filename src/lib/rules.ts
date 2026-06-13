/**
 * Pure parsing of `database.rules.json` and project app data.
 * No server dependencies — safe to import from client components.
 */

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
