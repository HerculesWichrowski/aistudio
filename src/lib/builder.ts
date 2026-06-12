import { selectFileContext } from "./context";
import { safePath, type Project } from "./projects";
import { openRouterHeaders, resolveModel } from "./openrouter";

export type BuildPlan = {
  summary?: string;
  upsert?: string[];
  delete?: string[];
};

export type FileOperation = {
  action?: "upsert" | "delete";
  path?: string;
  content?: string;
};

export const BUILD_EVENT_PREFIX = "\n@@";

export function emitEvent(payload: Record<string, unknown>) {
  return `${BUILD_EVENT_PREFIX}${JSON.stringify(payload)}\n`;
}

/** Prefer smaller/support files first; app.js last (largest, depends on others). */
const GENERATION_ORDER = ["database.rules.json", "index.html", "styles.css", "app.js"];

export function sortGenerationPaths(paths: string[]) {
  const rank = (path: string) => {
    const index = GENERATION_ORDER.indexOf(path);
    return index === -1 ? GENERATION_ORDER.length : index;
  };
  return [...new Set(paths.filter(Boolean))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  );
}

const BASE_SYSTEM = `You are the app builder inside aistudio, a chat-to-app product. The user describes an app; you build and maintain it as a small set of files that run directly in the browser.

## Runtime — this is critical
The app is served as ONE self-contained HTML document inside a sandboxed page. There is NO bundler, NO npm, NO server, NO Next.js. What works:
- index.html is the entry point. Always create it.
- You may split out styles.css and app.js; they are inlined automatically when referenced via <link rel="stylesheet" href="styles.css"> and <script src="app.js">. Never reference local files any other way.
- CDN libraries are allowed via https URLs. Prefer plain HTML/CSS/JS unless the app genuinely benefits from a library.
- localStorage/sessionStorage exist but are NOT persistent across reloads. Keep state in memory unless using the built-in database.

## Built-in AI — window.ai
- \`await window.ai.chat("prompt")\` → string reply
- \`await window.ai.chat([{role:"user",content:"..."}], { system: "...", json: true })\`

## Built-in database — window.db
Apps can persist data without a backend when \`database.rules.json\` exists:
- \`await window.db.list("tableName")\` → array of rows (each has an \`id\`)
- \`await window.db.insert("tableName", { field: value })\`
- \`await window.db.update("tableName", id, { field: value })\`
- \`await window.db.delete("tableName", id)\`

\`database.rules.json\` MUST use this exact shape (top-level \`tables\` key is required):

\`\`\`json
{
  "tables": {
    "employees": {
      "fields": {
        "name": { "type": "string", "required": true },
        "active": { "type": "boolean", "default": true }
      }
    }
  }
}
\`\`\`

When the user asks for a database, create that file and wire the UI to window.db.

## Quality bar
- Ship complete, working features. No TODOs, no placeholder screens.
- Modern, clean, responsive UI with sensible spacing and typography.`;

const PLAN_PROMPT = `${BASE_SYSTEM}

## Planning phase — chat only
Reply like a helpful assistant in a product UI. The user sees ONLY your natural-language reply — no file lists, no bullet plans, no markdown headings, no code fences in the visible text.

Write 1–2 short sentences:
- Acknowledge what they asked for in plain language.
- Say you'll start working on it right away (when code changes are needed).

Examples of good replies:
- "Sure — I'll build an employee, asset, and onboarding manager with a database and AI chat. Starting now."
- "Got it. I'll add dark mode to the app."
- "Here's how window.db works in your app: …" (when they only ask a question)

Do NOT mention file paths, \`build_plan\`, JSON, or implementation steps in the visible reply.

When code changes ARE needed, end your reply with exactly one hidden machine block (never describe this block to the user):

\`\`\`build_plan
{"summary":"internal one-line plan","upsert":["index.html"],"delete":[]}
\`\`\`

## Follow-up edits — always emit build_plan
If the project already has files and the user asks to change, update, fix, add, restyle, or improve anything, you MUST include build_plan with every file that needs to change:
- CSS / colors / theme / fonts / layout → \`styles.css\` if it exists, otherwise \`index.html\` (when styles are inline)
- UI structure / HTML → \`index.html\`
- Behavior / logic / features → \`app.js\` (and \`index.html\` if markup changes too)
- Database / tables / fields → \`database.rules.json\` plus any files that use the data

Never say you will update the app without also emitting build_plan. Acknowledging the request in chat is not enough — the block is required for files to change.

If the user only asks a question with no code changes, answer normally and omit the build_plan block.`;

const FILE_PROMPT = `${BASE_SYSTEM}

## Single-file generation (background — not shown in chat)
Generate ONE file. Output exactly one fenced block with the raw file content (no JSON escaping):

\`\`\`file:FILENAME
...complete file content...
\`\`\`

Rules:
- Include the FULL file content. Paths are relative. Never use .. or dotfiles.
- Do NOT wrap content in JSON. Put the file verbatim inside the fence.
- No prose outside the fence.`;

export function extractBuildPlan(text: string): BuildPlan | null {
  const match = text.match(/```build_plan\s*([\s\S]*?)```/);
  if (!match) return extractBuildPlanLenient(text);
  try {
    return normalizeBuildPlan(JSON.parse(match[1].trim()) as BuildPlan);
  } catch {
    return extractBuildPlanLenient(text);
  }
}

function normalizeBuildPlan(raw: BuildPlan | null): BuildPlan | null {
  if (!raw) return null;
  return {
    summary: raw.summary,
    upsert: [...new Set((raw.upsert ?? []).filter(Boolean))],
    delete: [...new Set((raw.delete ?? []).filter(Boolean))],
  };
}

/** Recover plan JSON when the model omits fences or uses slightly invalid JSON. */
export function extractBuildPlanLenient(text: string): BuildPlan | null {
  const objectMatch = text.match(/\{[\s\S]*?"upsert"\s*:[\s\S]*?\}/);
  if (!objectMatch) return null;
  try {
    return normalizeBuildPlan(JSON.parse(objectMatch[0]) as BuildPlan);
  } catch {
    return null;
  }
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

function hasFile(files: VirtualFile[], path: string) {
  return files.some((file) => file.path === path);
}

function cssTargetPath(files: VirtualFile[]) {
  if (hasFile(files, "styles.css")) return "styles.css";
  const html = files.find((file) => file.path === "index.html");
  if (html) return "index.html";
  return "styles.css";
}

/** Guess which files to regenerate when the model forgets build_plan. */
export function inferEditPaths(message: string, files: VirtualFile[]) {
  const paths = new Set<string>();

  if (STYLE_KEYWORDS.test(message)) paths.add(cssTargetPath(files));
  if (JS_KEYWORDS.test(message) && hasFile(files, "app.js")) paths.add("app.js");
  if (HTML_KEYWORDS.test(message) && hasFile(files, "index.html")) paths.add("index.html");
  if (DB_KEYWORDS.test(message) && hasFile(files, "database.rules.json")) {
    paths.add("database.rules.json");
  }

  if (paths.size > 0) return [...paths];

  if (files.length === 0) return ["index.html", "styles.css", "app.js"];

  for (const path of ["index.html", "styles.css", "app.js", "database.rules.json"]) {
    if (hasFile(files, path)) paths.add(path);
  }

  return [...paths];
}

export function sanitizeHistoryForBuilder(history: ChatMessage[]) {
  return history.map((message) => {
    if (message.role !== "assistant") return message;
    const stripped = message.content.replace(/```file_operation\s*[\s\S]*?```/g, "").trim();
    return { ...message, content: stripped };
  });
}

const PLAN_REPAIR_PROMPT = `${BASE_SYSTEM}

Output ONLY one build_plan block — no visible chat text.
List every project file path that must be created or updated for the user's latest request.
Use paths exactly as they appear in the project structure (e.g. styles.css, index.html, app.js).

\`\`\`build_plan
{"summary":"internal one-line plan","upsert":["styles.css"],"delete":[]}
\`\`\``;

export async function generatePlanRepair(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  userRequest: string
) {
  const messages = buildContextMessages(files, history.slice(0, -1), PLAN_REPAIR_PROMPT);
  messages.push({ role: "user", content: `Latest request:\n${userRequest}` });

  const text = await completeOnce(project, messages, { maxTokens: 512 });
  return extractBuildPlan(text);
}

export async function resolveBuildPlan(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  planRaw: string,
  userRequest: string
) {
  let plan = extractBuildPlan(planRaw);
  if ((plan?.upsert?.length ?? 0) > 0 || (plan?.delete?.length ?? 0) > 0) return plan;

  if (!looksLikeEditRequest(userRequest, files.length > 0)) return null;

  plan = await generatePlanRepair(project, files, history, userRequest);
  if ((plan?.upsert?.length ?? 0) > 0 || (plan?.delete?.length ?? 0) > 0) return plan;

  const upsert = inferEditPaths(userRequest, files);
  if (upsert.length === 0) return null;

  return {
    summary: planSummaryText(planRaw) || userRequest,
    upsert,
    delete: [],
  };
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

/** Strip hidden plan blocks and any trailing partial fences while streaming. */
export function stripVisiblePlanText(text: string) {
  let result = text.replace(/```build_plan\s*[\s\S]*?```/g, "");
  result = result.replace(/```build_plan[\s\S]*$/g, "");
  result = result.replace(/```[\s\S]*$/g, "");
  result = result.replace(/\n\s*[-*]\s*\*\*(Create|Edit|Delete)[^\n]*/gi, "");
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function planSummaryText(text: string) {
  return stripVisiblePlanText(text).trim();
}

/** User-visible plan text — conversational only, no file lists. */
export function visiblePlanText(raw: string) {
  return planSummaryText(raw);
}

export type StoredFileOperation = {
  action: "upsert" | "delete";
  path: string;
  status: "done" | "deleted" | "error";
  error?: string;
};

export function formatFileOperationsBlock(ops: StoredFileOperation[]) {
  if (!ops.length) return "";
  return `\n\n\`\`\`file_operation\n${JSON.stringify(ops)}\n\`\`\``;
}

export function formatAssistantReply(
  planText: string,
  results?: { deleted: string[]; updated: string[]; failed: string[] }
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
      (path): StoredFileOperation => ({ action: "upsert", path, status: "error" })
    ),
  ];

  return `${visible}${formatFileOperationsBlock(ops)}`;
}

type ChatMessage = { role: string; content: string };
type VirtualFile = { path: string; content: string };

async function chatCompletion(
  project: Project,
  messages: ChatMessage[],
  stream: boolean,
  options?: { maxTokens?: number }
) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(project),
    body: JSON.stringify({
      model: await resolveModel(project.model, project),
      stream,
      messages,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
}

export async function streamCompletion(
  project: Project,
  messages: ChatMessage[],
  onDelta: (text: string) => void
) {
  const upstream = await chatCompletion(project, messages, true);
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(detail || upstream.statusText);
  }

  const reader = upstream.body.getReader();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += new TextDecoder().decode(value);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return fullText;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {}
    }
  }

  return fullText;
}

export async function completeOnce(
  project: Project,
  messages: ChatMessage[],
  options?: { maxTokens?: number }
) {
  const upstream = await chatCompletion(project, messages, false, options);
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(detail || upstream.statusText);
  }
  const data = await upstream.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

export function buildContextMessages(
  files: VirtualFile[],
  history: ChatMessage[],
  systemPrompt: string,
  options?: { planPaths?: string[]; sessionPaths?: string[] }
): ChatMessage[] {
  const { contextBlock } = selectFileContext(files, {
    planPaths: options?.planPaths,
    sessionPaths: options?.sessionPaths,
  });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: contextBlock },
    ...history,
  ];
}

export async function generatePlan(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  onVisibleDelta: (visibleChunk: string) => void
) {
  let raw = "";
  let lastVisible = "";

  await streamCompletion(
    project,
    buildContextMessages(files, history, PLAN_PROMPT),
    (delta) => {
      raw += delta;
      const visible = stripVisiblePlanText(raw);
      const chunk = visible.slice(lastVisible.length);
      if (chunk) onVisibleDelta(chunk);
      lastVisible = visible;
    }
  );

  return raw;
}

export async function generateFile(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  path: string,
  plan: BuildPlan,
  sessionPaths: string[]
) {
  const instruction = [
    `Implement ONLY the file "${path}".`,
    plan.summary ? `Plan: ${plan.summary}` : "",
    path === "database.rules.json"
      ? `Use this exact JSON shape with a top-level "tables" key:
{"tables":{"tableName":{"fields":{"fieldName":{"type":"string","required":true}}}}}`
      : "",
    `Return the complete file in a single \`\`\`file:${path}\`\`\` block.`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages = buildContextMessages(files, history, FILE_PROMPT, {
    planPaths: [...(plan.upsert ?? []), ...(plan.delete ?? [])],
    sessionPaths,
  });
  messages.push({ role: "user", content: instruction });

  const maxTokens = path === "app.js" ? 16_384 : 8_192;
  let text = await completeOnce(project, messages, { maxTokens });
  let ops = extractFileOperations(text).filter((op) => op.path === path);
  if (ops[0]) return ops[0];

  // One retry — large JS files often truncate or omit the closing fence.
  text = await completeOnce(project, messages, { maxTokens });
  ops = extractFileOperations(text).filter((op) => op.path === path);
  return ops[0] ?? extractFileOperations(text)[0] ?? null;
}

export { PLAN_PROMPT, FILE_PROMPT, BASE_SYSTEM };
