import { generateFile, generatePlan, resolveBuildPlan } from "./builder";
import { mergeSessionPaths } from "./context";
import { findMissingLocalImports } from "./imports";
import { safePath } from "./paths";
import {
  extractPartialFileContent,
  formatAssistantReply,
  planSummaryText,
  planHasChanges,
  sanitizeHistoryForBuilder,
  sortGenerationPaths,
  stripVisiblePlanText,
  type FileOperation,
} from "./plan";
import {
  addMessage,
  deleteFile,
  listFiles,
  listMessages,
  upsertFile,
  type Project,
} from "./projects";
import { validateGeneratedFile } from "./validate";
import {
  getBuildRun,
  isRunCancelled,
  mergeBuildEvent,
  patchBuildRun,
  saveRunFilesSnapshot,
  type BuildRunEvent,
} from "./build-runs";

type VirtualFile = { path: string; content: string };

/** Extra modules generated when files import @app/ paths that don't exist. */
const MAX_AUTO_MODULES = 3;

export async function executeBuildRun(runId: string, project: Project, userRequest: string) {
  const run = await getBuildRun(runId);
  if (!run || run.status !== "running") return;

  const projectId = project.id;
  let streamChat = "";
  let events: BuildRunEvent[] = [];
  let phase: "planning" | "building" | "idle" = "planning";
  let lastDraftPersist = 0;

  async function persist(extra?: Parameters<typeof patchBuildRun>[1]) {
    await patchBuildRun(runId, {
      streamChat,
      events,
      phase,
      ...extra,
    });
  }

  async function abortIfCancelled() {
    if (!(await isRunCancelled(runId))) return false;
    phase = "idle";
    await persist({ status: "cancelled" });
    return true;
  }

  const recordEvent = (event: BuildRunEvent) => {
    events = mergeBuildEvent(events, event);
  };

  try {
    if (await abortIfCancelled()) return;

    const messages = await listMessages(projectId);
    const files = (await listFiles(projectId)) as unknown as VirtualFile[];

    const history = messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content),
    }));
    const builderHistory = sanitizeHistoryForBuilder(history);

    phase = "planning";
    await persist();

    let planBuffer = "";
    const planRaw = await generatePlan(
      project,
      files,
      builderHistory,
      (chunk) => {
        planBuffer += chunk;
        streamChat = stripVisiblePlanText(planBuffer);
        void persist();
      },
      { shouldAbort: () => isRunCancelled(runId), userRequest }
    );

    if (await abortIfCancelled()) return;

    streamChat = stripVisiblePlanText(planRaw);
    await persist();

    const plan = await resolveBuildPlan(project, files, builderHistory, planRaw, userRequest);
    const summary = planSummaryText(planRaw);

    if (!planHasChanges(plan)) {
      if (summary.trim()) {
        await addMessage(projectId, "assistant", summary.trim());
      }
      phase = "idle";
      await persist({ status: "done" });
      return;
    }

    if (await abortIfCancelled()) return;

    // Checkpoint the pre-build file tree so this run can be rolled back.
    await saveRunFilesSnapshot(runId, files);

    phase = "building";
    await persist();

    const upsertPaths = sortGenerationPaths(plan.upsert ?? []);
    const deletePaths = [...new Set((plan.delete ?? []).filter(Boolean))];
    const sessionPaths = new Set<string>();
    let currentFiles = files;

    for (const path of [...deletePaths, ...upsertPaths]) {
      recordEvent({ path, status: "start" });
    }
    await persist();

    for (const path of deletePaths) {
      if (await abortIfCancelled()) return;
      await deleteFile(projectId, path);
      recordEvent({ path, status: "deleted" });
      currentFiles = currentFiles.filter((file) => file.path !== path);
      await persist();
    }

    const fileResults: { path: string; ok: boolean; error?: string }[] = [];

    const generateOne = async (path: string, feedback?: string): Promise<FileOperation | null> =>
      generateFile(project, currentFiles, builderHistory, path, plan, [...sessionPaths], {
        feedback,
        userRequest,
        shouldAbort: () => isRunCancelled(runId),
        onRawDelta: (raw) => {
          const draft = extractPartialFileContent(raw, path);
          if (draft === null) return;
          recordEvent({ path, status: "start", draft });
          const now = Date.now();
          if (now - lastDraftPersist > 350) {
            lastDraftPersist = now;
            void persist();
          }
        },
      });

    const buildOne = async (path: string) => {
      try {
        const op = await generateOne(path);
        if (await isRunCancelled(runId)) return "cancelled" as const;

        if (!op?.path || op.action === "delete") {
          recordEvent({ path, status: "error", error: "No file content returned" });
          fileResults.push({ path, ok: false, error: "No file content returned" });
          return "failed" as const;
        }

        let savedPath = op.path;
        let savedContent = op.content ?? "";

        // Static validation: regenerate once with the error as feedback, and
        // if it still fails, save the best attempt so the user can inspect it.
        let validation = validateGeneratedFile(savedPath, savedContent);
        if (!validation.ok) {
          recordEvent({ path: savedPath, status: "start" });
          await persist();
          const retried = await generateOne(path, validation.error);
          if (await isRunCancelled(runId)) return "cancelled" as const;

          if (retried?.path && retried.action !== "delete") {
            savedPath = retried.path;
            savedContent = retried.content ?? "";
            validation = validateGeneratedFile(savedPath, savedContent);
          }
        }

        await upsertFile(projectId, savedPath, savedContent);
        mergeSessionPaths(sessionPaths, [savedPath]);
        currentFiles = [
          ...currentFiles.filter((file) => file.path !== savedPath),
          { path: savedPath, content: savedContent },
        ];

        if (validation.ok) {
          recordEvent({ path: savedPath, status: "done" });
          fileResults.push({ path: savedPath, ok: true });
          return "ok" as const;
        }

        recordEvent({
          path: savedPath,
          status: "error",
          error: `Saved, but ${validation.error}`,
        });
        fileResults.push({ path: savedPath, ok: false, error: validation.error });
        return "failed" as const;
      } catch (error) {
        if (await isRunCancelled(runId)) return "cancelled" as const;
        const message = error instanceof Error ? error.message : "Generation failed";
        recordEvent({ path, status: "error", error: message });
        fileResults.push({ path, ok: false, error: message });
        return "failed" as const;
      } finally {
        await persist();
      }
    };

    for (const path of upsertPaths) {
      if (await abortIfCancelled()) return;
      if ((await buildOne(path)) === "cancelled") return;
    }

    // Completion pass: generate any @app/ modules the new code imports but
    // the plan forgot to include, instead of shipping a broken preview.
    const missing = findMissingLocalImports(currentFiles)
      .filter((entry) => safePath(entry.path))
      .slice(0, MAX_AUTO_MODULES);

    for (const entry of missing) {
      if (await abortIfCancelled()) return;
      recordEvent({ path: entry.path, status: "start" });
      await persist();

      // Extend the plan so this and later generations see the new module.
      plan.upsert = [...(plan.upsert ?? []), entry.path];
      plan.briefs = {
        ...(plan.briefs ?? {}),
        [entry.path]: `module imported by ${entry.importers.join(", ")} — implement exactly what those importers use`,
      };
      if ((await buildOne(entry.path)) === "cancelled") return;
    }

    if (await abortIfCancelled()) return;

    const succeeded = fileResults.filter((entry) => entry.ok).map((entry) => entry.path);
    const failed = fileResults
      .filter((entry) => !entry.ok)
      .map(({ path, error }) => ({ path, error }));

    await addMessage(
      projectId,
      "assistant",
      formatAssistantReply(planRaw, {
        deleted: deletePaths,
        updated: succeeded,
        failed,
      })
    );

    phase = "idle";
    await persist({ status: "done" });
  } catch (error) {
    if (await isRunCancelled(runId)) return;
    const message = error instanceof Error ? error.message : "Build failed";
    phase = "idle";
    await persist({ status: "error", error: message });
  }
}
