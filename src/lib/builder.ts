import { buildContextMessages, completeOnce, streamCompletion } from "./llm";
import type { ChatMessage, VirtualFile } from "./llm";
import {
  extractBuildPlan,
  extractFileOperations,
  looksLikeEditRequest,
  inferEditPaths,
  planHasChanges,
  planSummaryText,
  stripVisiblePlanText,
  type BuildPlan,
} from "./plan";
import { FILE_PROMPT, PLAN_PROMPT, PLAN_REPAIR_PROMPT } from "./prompts";
import { formatShadcnGuide } from "./shadcn-components";
import type { Project } from "./projects";

/**
 * Builder orchestration: the two LLM phases of a build.
 *
 * 1. `generatePlan` — streams a short conversational reply that ends in a
 *    hidden build_plan block (paths + per-file briefs).
 * 2. `generateFile` — one call per planned file. Each call sees the project
 *    context, the plan briefs (the cross-file contract), and any files
 *    already generated this session.
 */

export async function generatePlan(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  onVisibleDelta: (visibleChunk: string) => void,
  options?: { shouldAbort?: () => boolean | Promise<boolean>; userRequest?: string }
) {
  let raw = "";
  let lastVisible = "";
  const latestRequest = options?.userRequest ?? history.at(-1)?.content ?? "";
  const system = `${PLAN_PROMPT}\n\n${formatShadcnGuide(latestRequest)}`;

  await streamCompletion(
    project,
    buildContextMessages(files, history, system),
    (delta) => {
      raw += delta;
      const visible = stripVisiblePlanText(raw);
      const chunk = visible.slice(lastVisible.length);
      if (chunk) onVisibleDelta(chunk);
      lastVisible = visible;
    },
    { shouldAbort: options?.shouldAbort }
  );

  return raw;
}

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

function buildFileSystemPrompt(plan: BuildPlan, userRequest: string) {
  const context = [plan.summary, userRequest].filter(Boolean).join(" ");
  return `${FILE_PROMPT}\n\n${formatShadcnGuide(context)}`;
}

export async function resolveBuildPlan(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  planRaw: string,
  userRequest: string
): Promise<BuildPlan | null> {
  let plan = extractBuildPlan(planRaw);
  if (planHasChanges(plan)) return plan;

  if (!looksLikeEditRequest(userRequest, files.length > 0)) return null;

  plan = await generatePlanRepair(project, files, history, userRequest);
  if (planHasChanges(plan)) return plan;

  const upsert = inferEditPaths(userRequest, files);
  if (upsert.length === 0) return null;

  return {
    summary: planSummaryText(planRaw) || userRequest,
    upsert,
    delete: [],
  };
}

function briefLines(plan: BuildPlan, currentPath: string) {
  const briefs = plan.briefs ?? {};
  const lines = (plan.upsert ?? [])
    .filter((path) => path !== currentPath)
    .map((path) => `- ${path}${briefs[path] ? ` — ${briefs[path]}` : ""}`);
  return lines.join("\n");
}

export async function generateFile(
  project: Project,
  files: VirtualFile[],
  history: ChatMessage[],
  path: string,
  plan: BuildPlan,
  sessionPaths: string[],
  options?: {
    onRawDelta?: (raw: string) => void;
    shouldAbort?: () => boolean | Promise<boolean>;
    /** Validation feedback from a rejected previous attempt. */
    feedback?: string;
    userRequest?: string;
  }
) {
  const siblings = briefLines(plan, path);
  const instruction = [
    `Implement ONLY the file "${path}".`,
    plan.summary ? `Plan: ${plan.summary}` : "",
    plan.briefs?.[path] ? `Brief for this file: ${plan.briefs[path]}` : "",
    siblings ? `Other files in this build (their briefs are the contract — match them):\n${siblings}` : "",
    path === "database.rules.json"
      ? `Use this exact JSON shape with a top-level "tables" key:
{"tables":{"tableName":{"fields":{"fieldName":{"type":"string","required":true}}}}}`
      : "",
    path.startsWith("components/")
      ? "One Lit web component composing shadcn-* tags for all UI. Use @app/ imports for local deps. Export the class and customElements.define at the bottom."
      : "",
    path === "app.js"
      ? "Side-effect imports only: lit + every @shcnwc/shadcn-*-web-component package used anywhere in the app. No UI markup."
      : "",
    path === "index.html"
      ? "Thin shell: Tailwind v4 browser script, import map (lit + shadcn packages), styles.css, custom element tags, <script type=\"module\" src=\"app.js\">."
      : "",
    path === "styles.css"
      ? "shadcn :root CSS variables (background, foreground, primary, muted, border, radius, etc.) plus page-level layout/typography only."
      : "",
    options?.feedback
      ? `Your previous attempt at this file was rejected: ${options.feedback}\nReturn the corrected COMPLETE file.`
      : "",
    `Return the complete file in a single \`\`\`file:${path}\`\`\` block.`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages = buildContextMessages(files, history, buildFileSystemPrompt(plan, options?.userRequest ?? ""), {
    planPaths: [...(plan.upsert ?? []), ...(plan.delete ?? [])],
    sessionPaths,
  });
  messages.push({ role: "user", content: instruction });

  const maxTokens = path === "app.js" ? 16_384 : 8_192;
  let raw = "";
  await streamCompletion(
    project,
    messages,
    (delta) => {
      raw += delta;
      options?.onRawDelta?.(raw);
    },
    { shouldAbort: options?.shouldAbort }
  );

  let ops = extractFileOperations(raw).filter((op) => op.path === path);
  if (ops[0]) return ops[0];

  if (options?.shouldAbort && (await options.shouldAbort())) return null;

  // One retry — large JS files often truncate or omit the closing fence.
  raw = await completeOnce(project, messages, { maxTokens });
  options?.onRawDelta?.(raw);
  ops = extractFileOperations(raw).filter((op) => op.path === path);
  return ops[0] ?? extractFileOperations(raw)[0] ?? null;
}
