import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { listMessages, truncateMessagesFrom } from "@/lib/projects";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  return Response.json(await listMessages(projectId));
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  const messageId = url.searchParams.get("fromMessageId") ?? "";
  const include = url.searchParams.get("include") === "true";

  if (!projectId || !messageId) {
    return new Response("Missing projectId or fromMessageId", { status: 400 });
  }

  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;

  await truncateMessagesFrom(projectId, messageId, include);
  return Response.json({ ok: true });
}
