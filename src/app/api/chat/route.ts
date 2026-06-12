import { after } from "next/server";
import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { createBuildRun, getActiveBuildRun } from "@/lib/build-runs";
import { executeBuildRun } from "@/lib/execute-build";
import { formatUserRequestWithAttachments, type ChatAttachment } from "@/lib/attachments";
import { addMessage } from "@/lib/projects";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { projectId, content, skipUserInsert, attachments } = await req.json();

  const safeAttachments: ChatAttachment[] = Array.isArray(attachments)
    ? attachments
        .filter(
          (item: unknown): item is ChatAttachment =>
            !!item &&
            typeof item === "object" &&
            typeof (item as ChatAttachment).name === "string" &&
            typeof (item as ChatAttachment).content === "string"
        )
        .map((item) => ({
          name: item.name.slice(0, 200),
          content: item.content.slice(0, 48_000),
        }))
    : [];

  if (!projectId || (!content?.trim() && safeAttachments.length === 0)) {
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
    const stored = content?.trim() || `[${safeAttachments.map((file) => file.name).join(", ")}]`;
    await addMessage(projectId, "user", stored);
  }

  const runId = await createBuildRun(projectId);
  const userRequest = formatUserRequestWithAttachments(content ?? "", safeAttachments);

  after(async () => {
    await executeBuildRun(runId, project, userRequest);
  });

  return Response.json({ runId });
}
