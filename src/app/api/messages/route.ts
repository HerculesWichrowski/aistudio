import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { listMessages } from "@/lib/projects";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  return Response.json(await listMessages(projectId));
}
