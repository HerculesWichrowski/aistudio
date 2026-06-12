import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveModel } from "@/lib/openrouter";
import { listProjects, createProject } from "@/lib/projects";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await listProjects(userId));
}

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, model } = await req.json();
  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });

  const resolvedModel = await resolveModel(typeof model === "string" ? model : null, null);
  const project = await createProject(
    userId,
    name.trim().slice(0, 80),
    description ?? "",
    resolvedModel
  );
  return Response.json(project, { status: 201 });
}
