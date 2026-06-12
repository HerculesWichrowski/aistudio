import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { DATABASE_RULES_PATH, loadProjectRules, runDataOperation } from "@/lib/database";
import { getProject, listFiles } from "@/lib/projects";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  await initDB();

  let body: { projectId?: string; action?: string; table?: string; id?: string; row?: unknown; patch?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
  }

  const { projectId, action, table, id, row, patch } = body;
  if (!projectId || !action) {
    return new Response("Expected { projectId, action }", { status: 400, headers: CORS_HEADERS });
  }

  const project = await getProject(projectId);
  if (!project) {
    return new Response("Unknown project", { status: 404, headers: CORS_HEADERS });
  }

  const files = (await listFiles(projectId)) as unknown as { path: string; content: string }[];
  const { rulesFile, rules } = loadProjectRules(files);

  if (!rulesFile) {
    return new Response("database.rules.json was not found in project files", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  if (!rules?.tables || Object.keys(rules.tables).length === 0) {
    return new Response(
      "database.rules.json exists but has no valid tables. Expected { \"tables\": { \"employees\": { \"fields\": { \"name\": { \"type\": \"string\" } } } } }",
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const result = await runDataOperation(projectId, rules, {
      action,
      table,
      id,
      row: row && typeof row === "object" ? (row as Record<string, unknown>) : undefined,
      patch: patch && typeof patch === "object" ? (patch as Record<string, unknown>) : undefined,
    });
    return Response.json({ result }, { headers: CORS_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database operation failed";
    return new Response(message, { status: 400, headers: CORS_HEADERS });
  }
}
