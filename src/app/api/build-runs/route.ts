import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { getActiveBuildRun, toBuildRunSnapshot } from "@/lib/build-runs";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;

  const run = await getActiveBuildRun(projectId);
  if (!run) return Response.json(null);

  return Response.json(toBuildRunSnapshot(run));
}
