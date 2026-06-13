import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { listRestorableRuns } from "@/lib/build-runs";

type Params = { params: Promise<{ id: string }> };

/** Restorable checkpoints: every build run snapshots the files it replaced. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  return Response.json({ entries: await listRestorableRuns(id) });
}
