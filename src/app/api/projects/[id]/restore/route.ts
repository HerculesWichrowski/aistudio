import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import {
  getActiveBuildRun,
  getBuildRun,
  getRunFilesSnapshot,
  recordCheckpointRun,
} from "@/lib/build-runs";
import { formatFileOperationsBlock, type StoredFileOperation } from "@/lib/plan";
import { addMessage, listFiles, replaceProjectFiles } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

/**
 * Rolls the project's files back to the snapshot a build run captured before
 * it ran. The current state is checkpointed first, so a restore is itself
 * undoable from the same history.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) {
    return Response.json({ error: "Expected { runId }" }, { status: 400 });
  }

  const run = await getBuildRun(runId);
  if (!run || run.project_id !== id) {
    return Response.json({ error: "Unknown run" }, { status: 404 });
  }
  if (await getActiveBuildRun(id)) {
    return Response.json({ error: "A build is still running" }, { status: 409 });
  }

  const snapshot = await getRunFilesSnapshot(runId);
  if (!snapshot) {
    return Response.json({ error: "This run has no restorable snapshot" }, { status: 404 });
  }

  const current = (await listFiles(id)) as unknown as { path: string; content: string }[];
  await recordCheckpointRun(id, "Checkpoint before restore", current);
  await replaceProjectFiles(id, snapshot);

  const summary = (run.stream_chat ?? "").trim().split("\n")[0]?.slice(0, 120);
  const ops: StoredFileOperation[] = snapshot.map((file) => ({
    action: "upsert",
    path: file.path,
    status: "done",
  }));
  await addMessage(
    id,
    "assistant",
    `Restored the project to its state from before${summary ? ` “${summary}”` : " an earlier build"} (${snapshot.length} files).${formatFileOperationsBlock(ops)}`
  );

  return Response.json({ ok: true, fileCount: snapshot.length });
}
