import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { mergeSessionPaths } from "@/lib/context";
import {
  addMessage,
  deleteFile,
  listFiles,
  listMessages,
  upsertFile,
} from "@/lib/projects";
import {
  emitEvent,
  extractBuildPlan,
  formatAssistantReply,
  generateFile,
  generatePlan,
  planSummaryText,
  sortGenerationPaths,
} from "@/lib/builder";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { projectId, content, skipUserInsert } = await req.json();

  if (!projectId || !content?.trim()) {
    return new Response("Missing projectId or content", { status: 400 });
  }

  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  const { project } = result;

  if (!skipUserInsert) {
    await addMessage(projectId, "user", content.trim());
  }

  const messages = await listMessages(projectId);
  const files = (await listFiles(projectId)) as unknown as { path: string; content: string }[];

  const history = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content),
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      try {
        const planRaw = await generatePlan(project, files, history, (chunk) => send(chunk));

        const plan = extractBuildPlan(planRaw);
        const summary = planSummaryText(planRaw);

        if (!plan || ((!plan.upsert?.length) && (!plan.delete?.length))) {
          if (summary.trim()) {
            await addMessage(projectId, "assistant", summary.trim());
          }
          controller.close();
          return;
        }

        send(emitEvent({ type: "plan_done" }));

        const upsertPaths = sortGenerationPaths(plan.upsert ?? []);
        const deletePaths = [...new Set((plan.delete ?? []).filter(Boolean))];
        const sessionPaths = new Set<string>();
        let currentFiles = files;

        for (const path of [...deletePaths, ...upsertPaths]) {
          send(emitEvent({ type: "file", status: "start", path }));
        }

        for (const path of deletePaths) {
          await deleteFile(projectId, path);
          send(emitEvent({ type: "file", status: "deleted", path }));
          currentFiles = currentFiles.filter((file) => file.path !== path);
        }

        const fileResults: { path: string; ok: boolean }[] = [];

        for (const path of upsertPaths) {
          const heartbeat = setInterval(() => {
            send(emitEvent({ type: "heartbeat", path }));
          }, 8000);

          try {
            const op = await generateFile(
              project,
              currentFiles,
              history,
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
          } finally {
            clearInterval(heartbeat);
          }
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

        send(emitEvent({ type: "done" }));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
