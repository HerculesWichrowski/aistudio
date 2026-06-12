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
Rules live in \`database.rules.json\` and define table names + field types. When the user asks for a database, create that file and wire the UI to window.db.

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
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as BuildPlan;
  } catch {
    return null;
  }
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
