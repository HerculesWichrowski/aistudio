import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { listMessages, addMessage } from "@/lib/projects";

export async function GET(req: NextRequest) {
  await initDB();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId")!;
  return Response.json(await listMessages(projectId));
}

export async function POST(req: NextRequest) {
  await initDB();
  const { projectId, role, content } = await req.json();
  return Response.json(await addMessage(projectId, role, content), { status: 201 });
}
