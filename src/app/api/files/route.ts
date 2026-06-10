import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { listFiles, upsertFile, deleteFile } from "@/lib/projects";

export async function GET(req: NextRequest) {
  await initDB();
  const { searchParams } = new URL(req.url);
  return Response.json(await listFiles(searchParams.get("projectId")!));
}

export async function POST(req: NextRequest) {
  await initDB();
  const { projectId, path, content } = await req.json();
  await upsertFile(projectId, path, content);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await initDB();
  const { searchParams } = new URL(req.url);
  await deleteFile(searchParams.get("projectId")!, searchParams.get("path")!);
  return Response.json({ ok: true });
}
