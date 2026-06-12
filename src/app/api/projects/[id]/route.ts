import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { updateProject, deleteProject } from "@/lib/projects";
import {
  defaultModel,
  FREE_ROUTER,
  hasApiKey,
  hasFullModelAccess,
  hasProjectKey,
  listModelOptions,
  resolveModel,
} from "@/lib/openrouter";

type Params = { params: Promise<{ id: string }> };

async function withAiMeta(project: Record<string, unknown>) {
  const typed = project as { model?: string; openrouter_api_key?: string };
  const models = await listModelOptions({
    openrouter_api_key: String(typed.openrouter_api_key ?? ""),
  });

  return {
    ...project,
    openrouter_api_key: hasProjectKey({ openrouter_api_key: String(typed.openrouter_api_key ?? "") })
      ? "••••••••"
      : "",
    model: await resolveModel(typed.model, {
      openrouter_api_key: String(typed.openrouter_api_key ?? ""),
    }),
    ai: {
      canUseAi: hasApiKey({ openrouter_api_key: String(typed.openrouter_api_key ?? "") }),
      hasProjectKey: hasProjectKey({ openrouter_api_key: String(typed.openrouter_api_key ?? "") }),
      defaultModel: defaultModel({ openrouter_api_key: String(typed.openrouter_api_key ?? "") }),
      models,
    },
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;
  return Response.json(await withAiMeta(result.project as unknown as Record<string, unknown>));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const body = await req.json();
  const project = result.project;

  if ("model" in body) {
    const resolved = await resolveModel(body.model, project);
    const allowed = await listModelOptions(project);
    const allowedIds = allowed.map((option) => option.id);
    if (!allowedIds.includes(resolved) && !hasFullModelAccess(project)) {
      return Response.json(
        { error: "Add your OpenRouter API key in settings to use paid or custom models." },
        { status: 403 }
      );
    }
    if (hasFullModelAccess(project) && !allowedIds.includes(resolved) && !/^[\w.-]+\/[\w.:+-]+$/.test(resolved)) {
      return Response.json({ error: "Invalid model ID." }, { status: 400 });
    }
    body.model = resolved;
  }

  if ("openrouter_api_key" in body) {
    const key = String(body.openrouter_api_key ?? "").trim();
    body.openrouter_api_key = key;
    if (key) {
      if (!("model" in body)) {
        body.model = defaultModel({ openrouter_api_key: key });
      }
    } else if (!("model" in body)) {
      body.model = FREE_ROUTER;
    }
  }

  await updateProject(id, body);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  await deleteProject(id);
  return Response.json({ ok: true });
}
