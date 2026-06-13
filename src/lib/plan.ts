import { safePath } from "./paths";

/**
 * Pure build-plan parsing and text utilities.
 * No server dependencies — safe to import from client components.
 */

export type BuildPlan = {
  summary?: string;
  upsert?: string[];
  delete?: string[];
  /** Per-file one-line briefs from the planning phase, keyed by path. */
  briefs?: Record<string, string>;
};

/** Raw plan entries may be plain paths or { path, brief } objects. */
type RawPlanEntry = string | { path?: string; brief?: string };

type RawBuildPlan = {
  summary?: string;
  upsert?: RawPlanEntry[];
  delete?: RawPlanEntry[];
};

export type FileOperation = {
  action?: "upsert" | "delete";
  path?: string;
  content?: string;
};

export type StoredFileOperation = {
  action: "upsert" | "delete";
  path: string;
  status: "done" | "deleted" | "error";
  error?: string;
};

/** Prefer dependencies first; index.html last so it references everything. */
function generationRank(path: string) {
  if (path === "database.rules.json") return 0;
  if (path.startsWith("lib/")) return 1;
  if (path.startsWith("components/")) return 2;
  if (path === "styles.css") return 3;
  if (path === "app.js") return 4;
  if (path === "index.html") return 5;
  return 6;
}

export function sortGenerationPaths(paths: string[]) {
  return [...new Set(paths.filter(Boolean))].sort(
    (a, b) => generationRank(a) - generationRank(b) || a.localeCompare(b)
  );
}

function entryPath(entry: RawPlanEntry): string {
  if (typeof entry === "string") return entry.trim();
  return entry?.path?.trim() ?? "";
}

function normalizeBuildPlan(raw: RawBuildPlan | null): BuildPlan | null {
  if (!raw || typeof raw !== "object") return null;

  const briefs: Record<string, string> = {};
  const upsert: string[] = [];
  for (const entry of raw.upsert ?? []) {
    const path = entryPath(entry);
    if (!path || upsert.includes(path)) continue;
    upsert.push(path);
    if (typeof entry === "object" && entry.brief?.trim()) {
      briefs[path] = entry.brief.trim();
    }
  }

  const remove = [...new Set((raw.delete ?? []).map(entryPath).filter(Boolean))];

  return {
    summary: raw.summary,
    upsert,
    delete: remove,
    ...(Object.keys(briefs).length > 0 ? { briefs } : {}),
  };
}

export function extractBuildPlan(text: string): BuildPlan | null {
  const fenced = text.match(/```build_plan\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return normalizeBuildPlan(JSON.parse(fenced[1].trim()) as RawBuildPlan);
    } catch {
      return extractBuildPlanLenient(fenced[1]);
    }
  }

  const xmlPlan = text.match(/<build_plan>\s*([\s\S]*?)<\/build_plan>/i);
  if (xmlPlan) {
    try {
      return normalizeBuildPlan(JSON.parse(xmlPlan[1].trim()) as RawBuildPlan);
    } catch {
      return extractBuildPlanLenient(xmlPlan[1]);
    }
  }

  const toolCallPlan = extractBuildPlanFromToolCall(text);
  if (toolCallPlan) return toolCallPlan;

  return extractBuildPlanLenient(text);
}

function extractBuildPlanFromToolCall(text: string): BuildPlan | null {
  const match = text.match(/<tool_call>\s*build_plan\s*([\s\S]*?)<\/tool_call>/i);
  if (!match) return null;

  const args: Record<string, string> = {};
  const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gi;
  for (const argMatch of match[1].matchAll(argRegex)) {
    args[argMatch[1].trim()] = argMatch[2].trim();
  }

  if (!args.summary && !args.upsert && !args.delete) return null;

  try {
    return normalizeBuildPlan({
      summary: args.summary,
      upsert: args.upsert ? (JSON.parse(args.upsert) as RawPlanEntry[]) : [],
      delete: args.delete ? (JSON.parse(args.delete) as RawPlanEntry[]) : [],
    });
  } catch {
    return null;
  }
}

/** Reads one balanced JSON object starting at `start` (string-aware). */
function readBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Recover plan JSON when the model omits fences or uses slightly invalid JSON. */
export function extractBuildPlanLenient(text: string): BuildPlan | null {
  const anchor = text.indexOf('"upsert"');
  if (anchor === -1) return null;

  // The object usually opens at the nearest "{" before "upsert"; step further
  // back when an earlier field (e.g. a summary containing "{") fooled us.
  let start = text.lastIndexOf("{", anchor);
  for (let attempt = 0; attempt < 3 && start !== -1; attempt++) {
    const candidate = readBalancedObject(text, start);
    if (candidate) {
      try {
        return normalizeBuildPlan(JSON.parse(candidate) as RawBuildPlan);
      } catch {}
    }
    start = text.lastIndexOf("{", start - 1);
  }
  return null;
}

export function planHasChanges(plan: BuildPlan | null): plan is BuildPlan {
  return Boolean(plan && ((plan.upsert?.length ?? 0) > 0 || (plan.delete?.length ?? 0) > 0));
}

const EDIT_VERB =
  /\b(update|change|add|remove|fix|make|set|turn|enable|disable|implement|modify|edit|adjust|improve|refactor|move|rename|replace|switch|restyle|style|redesign|tweak|dark|light|theme|color|font|build|create|please|could you|can you|want|need|should|try)\b/i;

const QUESTION_ONLY =
  /^(how|what|why|where|when|who|can you explain|tell me about|is there|does|do)\b/i;

const STYLE_KEYWORDS =
  /\b(css|style|styling|color|colou?r|theme|dark mode|light mode|font|gradient|background|design|layout|responsive|spacing|margin|padding|look|appearance|visual|ui|ux)\b/i;

const JS_KEYWORDS =
  /\b(javascript|function|feature|button|click|logic|behavior|bug|error|handler|event|fetch|api)\b/i;

const HTML_KEYWORDS =
  /\b(html|page|title|heading|section|form|input|modal|nav|menu|structure|markup|element)\b/i;

const DB_KEYWORDS =
  /\b(database|schema|table|field|column|persist|store data|record|row)\b/i;

export function looksLikeEditRequest(message: string, hasExistingFiles: boolean) {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (!hasExistingFiles) return true;
  if (QUESTION_ONLY.test(trimmed) && !EDIT_VERB.test(trimmed)) return false;
  return EDIT_VERB.test(trimmed);
}

type VirtualFile = { path: string; content: string };

function hasFile(files: VirtualFile[], path: string) {
  return files.some((file) => file.path === path);
}

function componentTargets(files: VirtualFile[], message: string) {
  const existing = files
    .filter((file) => file.path.startsWith("components/") && file.path.endsWith(".js"))
    .map((file) => file.path);

  if (existing.length === 1) return existing;
  if (existing.length === 0) return ["components/app-shell.js"];

  const lower = message.toLowerCase();
  const matched = existing.filter((path) => {
    const slug = path.replace(/^components\//, "").replace(/\.js$/, "").replace(/[-_]/g, " ");
    return slug.split(" ").some((word) => word.length > 3 && lower.includes(word));
  });
  return matched.length > 0 ? matched : existing.slice(0, 2);
}

/** Guess which files to regenerate when the model forgets build_plan. */
export function inferEditPaths(message: string, files: VirtualFile[]) {
  const paths = new Set<string>();

  if (STYLE_KEYWORDS.test(message)) paths.add("styles.css");
  if (HTML_KEYWORDS.test(message) || JS_KEYWORDS.test(message)) {
    for (const path of componentTargets(files, message)) paths.add(path);
    if (hasFile(files, "app.js")) paths.add("app.js");
  }
  if (HTML_KEYWORDS.test(message) && hasFile(files, "index.html")) paths.add("index.html");
  if (DB_KEYWORDS.test(message) && hasFile(files, "database.rules.json")) {
    paths.add("database.rules.json");
  }

  if (paths.size > 0) return [...paths];

  if (files.length === 0) {
    return ["index.html", "styles.css", "app.js", "components/app-shell.js"];
  }

  for (const path of ["index.html", "styles.css", "app.js", "database.rules.json"]) {
    if (hasFile(files, path)) paths.add(path);
  }
  for (const path of componentTargets(files, message)) paths.add(path);

  return [...paths];
}

type ChatMessage = { role: string; content: string };

export function sanitizeHistoryForBuilder(history: ChatMessage[]) {
  return history.map((message) => {
    if (message.role !== "assistant") return message;
    const stripped = stripVisiblePlanText(
      message.content.replace(/```file_operation\s*[\s\S]*?```/g, "")
    ).trim();
    return { ...message, content: stripped };
  });
}

export function extractFileOperations(text: string) {
  const operations: FileOperation[] = [];

  const rawFence = /```file:([^\n`]+)\n([\s\S]*?)```/g;
  let rawMatch: RegExpExecArray | null;
  while ((rawMatch = rawFence.exec(text)) !== null) {
    const path = rawMatch[1].trim();
    if (safePath(path)) {
      operations.push({ action: "upsert", path, content: rawMatch[2] });
    }
  }
  if (operations.length) return operations;

  const jsonFence = /```file_operation\s*([\s\S]*?)```/g;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonFence.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      operations.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  }

  return operations.filter((op) => op.path && safePath(op.path));
}

/** Best-effort partial file body while the model is still streaming a fence. */
export function extractPartialFileContent(text: string, path: string) {
  const marker = `\`\`\`file:${path}\n`;
  const index = text.indexOf(marker);
  if (index === -1) return null;
  const start = index + marker.length;
  const close = text.indexOf("\n```", start);
  return close === -1 ? text.slice(start) : text.slice(start, close);
}

/** Strip hidden plan blocks and any trailing partial fences while streaming. */
export function stripVisiblePlanText(text: string) {
  let result = text.replace(/```build_plan\s*[\s\S]*?```/g, "");
  result = result.replace(/```build_plan[\s\S]*$/g, "");
  result = result.replace(/<build_plan>\s*[\s\S]*?<\/build_plan>/gi, "");
  result = result.replace(/<build_plan>[\s\S]*$/gi, "");
  result = result.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  result = result.replace(/<tool_call>[\s\S]*$/gi, "");
  result = result.replace(/```[\s\S]*$/g, "");
  result = result.replace(/\n\s*[-*]\s*\*\*(Create|Edit|Delete)[^\n]*/gi, "");
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function planSummaryText(text: string) {
  return stripVisiblePlanText(text).trim();
}

export function formatFileOperationsBlock(ops: StoredFileOperation[]) {
  if (!ops.length) return "";
  return `\n\n\`\`\`file_operation\n${JSON.stringify(ops)}\n\`\`\``;
}

export function formatAssistantReply(
  planText: string,
  results?: { deleted: string[]; updated: string[]; failed: { path: string; error?: string }[] }
) {
  const visible = planSummaryText(planText);
  if (!results) return visible;

  const ops: StoredFileOperation[] = [
    ...results.deleted.map(
      (path): StoredFileOperation => ({ action: "delete", path, status: "deleted" })
    ),
    ...results.updated.map(
      (path): StoredFileOperation => ({ action: "upsert", path, status: "done" })
    ),
    ...results.failed.map(
      ({ path, error }): StoredFileOperation => ({
        action: "upsert",
        path,
        status: "error",
        ...(error ? { error } : {}),
      })
    ),
  ];

  return `${visible}${formatFileOperationsBlock(ops)}`;
}
