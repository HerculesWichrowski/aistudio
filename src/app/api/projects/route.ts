import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { listProjects, createProject } from "@/lib/projects";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await listProjects(userId));
}

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });

  const project = await createProject(userId, name.trim().slice(0, 80), description ?? "");
  return Response.json(project, { status: 201 });
}
