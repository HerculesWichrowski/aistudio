import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { listFiles, upsertFile, deleteFile, safePath } from "@/lib/projects";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  return Response.json(await listFiles(projectId));
}

export async function POST(req: NextRequest) {
  const { projectId, path, content } = await req.json();
  const result = await requireOwnedProject(projectId ?? "");
  if (!result.ok) return result.response;
  if (typeof path !== "string" || !safePath(path)) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  await upsertFile(projectId, path, content ?? "");
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const path = searchParams.get("path") ?? "";
  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;

  await deleteFile(projectId, path);
  return Response.json({ ok: true });
}
