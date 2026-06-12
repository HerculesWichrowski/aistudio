import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { cancelBuildRun, getBuildRun, toBuildRunSnapshot } from "@/lib/build-runs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getBuildRun(runId);
  if (!run) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const result = await requireOwnedProject(run.project_id);
  if (!result.ok) return result.response;

  return Response.json(toBuildRunSnapshot(run));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getBuildRun(runId);
  if (!run) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const result = await requireOwnedProject(run.project_id);
  if (!result.ok) return result.response;

  if (run.status === "running") {
    await cancelBuildRun(runId);
  }

  return Response.json({ ok: true });
}
