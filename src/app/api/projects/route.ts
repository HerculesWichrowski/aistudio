import { NextRequest } from "next/server";
import { initDB, turso } from "@/lib/db";
import { listProjects, createProject } from "@/lib/projects";

export async function GET() {
  await initDB();
  const projects = await listProjects();
  return Response.json(projects);
}

export async function POST(req: NextRequest) {
  await initDB();
  const { name, description } = await req.json();
  const project = await createProject(name, description ?? "");
  return Response.json(project, { status: 201 });
}
