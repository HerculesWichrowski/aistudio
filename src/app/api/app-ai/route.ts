import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { openRouterHeaders, resolveModel } from "@/lib/openrouter";

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

  let body: { projectId?: string; messages?: unknown; json?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
  }

  const { projectId, messages, json } = body;
  if (!projectId || !Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    return new Response("Expected { projectId, messages }", { status: 400, headers: CORS_HEADERS });
  }

  const project = await getProject(projectId);
  if (!project) {
    return new Response("Unknown project", { status: 404, headers: CORS_HEADERS });
  }

  const sanitized = messages
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof m === "object" &&
        ["system", "user", "assistant"].includes((m as { role?: string }).role ?? "") &&
        typeof (m as { content?: unknown }).content === "string"
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 32_000) }));

  if (sanitized.length === 0) {
    return new Response("No valid messages", { status: 400, headers: CORS_HEADERS });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(project),
    body: JSON.stringify({
      model: await resolveModel(project.model, project),
      messages: sanitized,
      max_tokens: 4096,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return new Response(detail || response.statusText, {
      status: response.status,
      headers: CORS_HEADERS,
    });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  return Response.json({ text }, { headers: CORS_HEADERS });
}
