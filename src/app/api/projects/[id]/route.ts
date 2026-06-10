import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { getProject, updateProject, deleteProject } from "@/lib/projects";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDB();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDB();
  const { id } = await params;
  const fields = await req.json();
  await updateProject(id, fields);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDB();
  const { id } = await params;
  await deleteProject(id);
  return Response.json({ ok: true });
}
