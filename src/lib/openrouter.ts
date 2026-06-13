import { DEFAULT_MODEL, type Project } from "./projects";

export const AUTO_ROUTER = "openrouter/auto";
export const FREE_ROUTER = "openrouter/free";

type OpenRouterModel = {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
};

let modelsCache: { at: number; models: OpenRouterModel[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export function hasPlatformKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function hasProjectKey(project?: Pick<Project, "openrouter_api_key"> | null) {
  return Boolean(project?.openrouter_api_key?.trim());
}

/** Server or user key — required to call OpenRouter at all. */
export function hasApiKey(project?: Pick<Project, "openrouter_api_key"> | null) {
  return hasPlatformKey() || hasProjectKey(project);
}

/** User-provided project key — unlocks paid models and custom model IDs. */
export function hasFullModelAccess(project?: Pick<Project, "openrouter_api_key"> | null) {
  return hasProjectKey(project);
}

export function resolveApiKey(project?: Pick<Project, "openrouter_api_key"> | null) {
  const projectKey = project?.openrouter_api_key?.trim();
  if (projectKey) return projectKey;
  return process.env.OPENROUTER_API_KEY?.trim() ?? "";
}

export function openRouterHeaders(project?: Pick<Project, "openrouter_api_key"> | null) {
  const key = resolveApiKey(project);
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function isFreeModel(model: OpenRouterModel) {
  if (model.id.endsWith(":free")) return true;
  const prompt = Number(model.pricing?.prompt ?? "1");
  const completion = Number(model.pricing?.completion ?? "1");
  return prompt === 0 && completion === 0;
}

async function fetchAllModels(): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (modelsCache && now - modelsCache.at < CACHE_MS) {
    return modelsCache.models;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: openRouterHeaders(),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(response.statusText);
    const data = (await response.json()) as { data?: OpenRouterModel[] };
    const models = data.data ?? [];
    modelsCache = { at: now, models };
    return models;
  } catch {
    return modelsCache?.models ?? [];
  }
}

export type ModelOption = { id: string; name: string; free: boolean };

export async function listModelOptions(
  project?: Pick<Project, "openrouter_api_key"> | null
): Promise<ModelOption[]> {
  const all = await fetchAllModels();
  const fullAccess = hasFullModelAccess(project);

  const fromApi = all
    .filter((model) => fullAccess || isFreeModel(model))
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      free: isFreeModel(model),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const routerOptions: ModelOption[] = fullAccess
    ? [{ id: AUTO_ROUTER, name: "Auto", free: false }]
    : [{ id: FREE_ROUTER, name: "Auto", free: true }];

  const seen = new Set<string>();
  const merged: ModelOption[] = [];
  for (const option of [...routerOptions, ...fromApi]) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }
  return merged;
}

export async function selectableModelIds(
  project?: Pick<Project, "openrouter_api_key"> | null
): Promise<string[]> {
  return (await listModelOptions(project)).map((option) => option.id);
}

/** Default router: auto with a user key, otherwise the free router. */
export function defaultModel(project?: Pick<Project, "openrouter_api_key"> | null) {
  return hasFullModelAccess(project) ? AUTO_ROUTER : FREE_ROUTER;
}

export async function resolveModel(
  stored: string | null | undefined,
  project?: Pick<Project, "openrouter_api_key"> | null
) {
  const fallback = defaultModel(project);
  const model = stored?.trim() || fallback;

  if (hasFullModelAccess(project)) {
    if (model === AUTO_ROUTER || model === FREE_ROUTER) return model;
    const allowed = await selectableModelIds(project);
    if (allowed.includes(model)) return model;
    if (/^[\w.-]+\/[\w.:+-]+$/.test(model)) return model;
    return fallback;
  }

  if (model === FREE_ROUTER) return FREE_ROUTER;
  const allowed = await selectableModelIds(project);
  return allowed.includes(model) ? model : FREE_ROUTER;
}

export { DEFAULT_MODEL };
