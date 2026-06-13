import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { duplicateProject } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

/** Clones a project's files and settings so risky changes can be tried on a copy. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const newId = await duplicateProject(result.project);
  return Response.json({ id: newId }, { status: 201 });
}
