import { after } from "next/server";
import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { createBuildRun, getActiveBuildRun } from "@/lib/build-runs";
import { executeBuildRun } from "@/lib/execute-build";
import { addMessage } from "@/lib/projects";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { projectId, content, skipUserInsert, contextPaths } = await req.json();

  if (!projectId || !content?.trim()) {
    return new Response("Missing projectId or content", { status: 400 });
  }

  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  const { project } = result;

  const existing = await getActiveBuildRun(projectId);
  if (existing) {
    return Response.json({ runId: existing.id, resumed: true });
  }

  if (!skipUserInsert) {
    await addMessage(projectId, "user", content.trim());
  }

  const runId = await createBuildRun(projectId);
  const userRequest = content.trim();

  after(async () => {
    await executeBuildRun(runId, project, userRequest, {
      contextPaths: Array.isArray(contextPaths)
        ? contextPaths.filter((path: unknown): path is string => typeof path === "string")
        : [],
    });
  });

  return Response.json({ runId });
}
