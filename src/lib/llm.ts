import { selectFileContext } from "./context";
import { openRouterHeaders, resolveModel } from "./openrouter";
import type { Project } from "./projects";

export type ChatMessage = { role: string; content: string };
export type VirtualFile = { path: string; content: string };

async function chatCompletion(
  project: Project,
  messages: ChatMessage[],
  stream: boolean,
  options?: { maxTokens?: number }
) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(project),
    body: JSON.stringify({
      model: await resolveModel(project.model, project),
      stream,
      messages,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
}

export async function streamCompletion(
  project: Project,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  options?: { shouldAbort?: () => boolean | Promise<boolean> }
) {
  const upstream = await chatCompletion(project, messages, true);
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(detail || upstream.statusText);
  }

  const reader = upstream.body.getReader();
  let buffer = "";
  let fullText = "";

  while (true) {
    if (options?.shouldAbort && (await options.shouldAbort())) {
      await reader.cancel().catch(() => {});
      break;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += new TextDecoder().decode(value);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return fullText;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {}
    }
  }

  return fullText;
}

export async function completeOnce(
  project: Project,
  messages: ChatMessage[],
  options?: { maxTokens?: number }
) {
  const upstream = await chatCompletion(project, messages, false, options);
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(detail || upstream.statusText);
  }
  const data = await upstream.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

export function buildContextMessages(
  files: VirtualFile[],
  history: ChatMessage[],
  systemPrompt: string,
  options?: { planPaths?: string[]; sessionPaths?: string[] }
): ChatMessage[] {
  const { contextBlock } = selectFileContext(files, {
    planPaths: options?.planPaths,
    sessionPaths: options?.sessionPaths,
  });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: contextBlock },
    ...history,
  ];
}
