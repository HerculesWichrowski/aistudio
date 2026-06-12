import { mergeSessionPaths } from "./context";
import {
  addMessage,
  deleteFile,
  listFiles,
  listMessages,
  upsertFile,
  type Project,
} from "./projects";
import {
  emitEvent,
  formatAssistantReply,
  generateFile,
  generatePlan,
  planSummaryText,
  resolveBuildPlan,
  sanitizeHistoryForBuilder,
  sortGenerationPaths,
  stripVisiblePlanText,
} from "./builder";
import {
  getBuildRun,
  mergeBuildEvent,
  patchBuildRun,
  type BuildRunEvent,
} from "./build-runs";

type VirtualFile = { path: string; content: string };

function parseStreamEvent(line: string): BuildRunEvent | null {
  if (!line.startsWith("\n@@")) return null;
  try {
    const event = JSON.parse(line.slice(3).trim()) as {
      type?: string;
      status?: string;
      path?: string;
      error?: string;
    };
    if (event.type === "file" && event.path && event.status) {
      return {
        path: event.path,
        status: event.status as BuildRunEvent["status"],
        error: event.error,
      };
    }
  } catch {}
  return null;
}

export async function executeBuildRun(runId: string, project: Project, userRequest: string) {
  const run = await getBuildRun(runId);
  if (!run || run.status !== "running") return;

  const projectId = project.id;
  let streamChat = "";
  let events: BuildRunEvent[] = [];
  let phase: "planning" | "building" | "idle" = "planning";

  async function persist(extra?: Parameters<typeof patchBuildRun>[1]) {
    await patchBuildRun(runId, {
      streamChat,
      events,
      phase,
      ...extra,
    });
  }

  const send = (text: string) => {
    if (!text.startsWith("\n@@")) {
      streamChat = stripVisiblePlanText(streamChat + text);
      return;
    }
    const event = parseStreamEvent(text);
    if (event) events = mergeBuildEvent(events, event);
    if (text.includes('"type":"plan_done"')) phase = "building";
  };

  try {
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
    const planRaw = await generatePlan(project, files, builderHistory, (chunk) => {
      planBuffer += chunk;
      streamChat = stripVisiblePlanText(planBuffer);
      void persist();
    });

    streamChat = stripVisiblePlanText(planRaw);
    await persist();

    const plan = await resolveBuildPlan(project, files, builderHistory, planRaw, userRequest);
    const summary = planSummaryText(planRaw);

    if (!plan || ((!plan.upsert?.length) && (!plan.delete?.length))) {
      if (summary.trim()) {
        await addMessage(projectId, "assistant", summary.trim());
      }
      phase = "idle";
      await persist({ status: "done" });
      return;
    }

    send(emitEvent({ type: "plan_done" }));
    phase = "building";
    await persist();

    const upsertPaths = sortGenerationPaths(plan.upsert ?? []);
    const deletePaths = [...new Set((plan.delete ?? []).filter(Boolean))];
    const sessionPaths = new Set<string>();
    let currentFiles = files;

    for (const path of [...deletePaths, ...upsertPaths]) {
      send(emitEvent({ type: "file", status: "start", path }));
    }
    await persist();

    for (const path of deletePaths) {
      await deleteFile(projectId, path);
      send(emitEvent({ type: "file", status: "deleted", path }));
      currentFiles = currentFiles.filter((file) => file.path !== path);
      await persist();
    }

    const fileResults: { path: string; ok: boolean }[] = [];

    for (const path of upsertPaths) {
      try {
        const op = await generateFile(
          project,
          currentFiles,
          builderHistory,
          path,
          plan,
          [...sessionPaths]
        );
        if (op?.path && op.action !== "delete") {
          await upsertFile(projectId, op.path, op.content ?? "");
          mergeSessionPaths(sessionPaths, [op.path]);
          const next = currentFiles.filter((file) => file.path !== op.path);
          next.push({ path: op.path, content: op.content ?? "" });
          currentFiles = next;
          send(emitEvent({ type: "file", status: "done", path: op.path }));
          fileResults.push({ path: op.path, ok: true });
        } else {
          send(emitEvent({
            type: "file",
            status: "error",
            path,
            error: "No file content returned",
          }));
          fileResults.push({ path, ok: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed";
        send(emitEvent({ type: "file", status: "error", path, error: message }));
        fileResults.push({ path, ok: false });
      }
      await persist();
    }

    const succeeded = fileResults.filter((entry) => entry.ok).map((entry) => entry.path);
    const failed = fileResults.filter((entry) => !entry.ok).map((entry) => entry.path);

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
    const message = error instanceof Error ? error.message : "Build failed";
    phase = "idle";
    await persist({ status: "error", error: message });
  }
}
