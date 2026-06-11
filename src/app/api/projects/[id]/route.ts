import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { updateProject, deleteProject } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;
  return Response.json(result.project);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  await updateProject(id, await req.json());
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  await deleteProject(id);
  return Response.json({ ok: true });
}
