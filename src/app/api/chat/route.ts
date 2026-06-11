import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import {
  addMessage,
  deleteFile,
  listFiles,
  listMessages,
  safePath,
  upsertFile,
  DEFAULT_MODEL,
} from "@/lib/projects";

const SYSTEM_PROMPT = `You are the app builder inside aistudio, a chat-to-app product. The user describes an app; you build and maintain it as a small set of files that run directly in the browser.

## Runtime — this is critical
The app is served as ONE self-contained HTML document inside a sandboxed page. There is NO bundler, NO npm, NO server, NO Next.js. What works:
- index.html is the entry point. Always create it.
- You may split out styles.css and app.js; they are inlined automatically when referenced via <link rel="stylesheet" href="styles.css"> and <script src="app.js">. Never reference local files any other way (no ES module imports between local files, no images by local path).
- CDN libraries are allowed via https URLs, e.g. React from esm.sh inside a <script type="module">, or Tailwind via its CDN script. Prefer plain HTML/CSS/JS unless the app genuinely benefits from a library.
- localStorage/sessionStorage exist but are NOT persistent across reloads (sandboxed origin). Keep state in memory; persistence is not available, so don't promise it.
- For icons/images use emoji, inline SVG, or data URLs.

## Built-in AI — window.ai
The platform injects a global \`window.ai\` so generated apps can use AI without any API key:
- \`await window.ai.chat("prompt")\` → string reply
- \`await window.ai.chat([{role:"user",content:"..."}], { system: "...", json: true })\` → with history, system prompt, and JSON-mode (returns a JSON string to parse)
When the user asks for AI features (chatbots, summarizers, generators, graders...), use window.ai. Always show a loading state while awaiting it and handle errors with try/catch.

## File protocol
When creating, updating, or deleting files, output one fenced block exactly like this:

\`\`\`file_operation
[{"action":"upsert","path":"index.html","content":"...complete file content..."},{"action":"delete","path":"old.js"}]
\`\`\`

Rules:
- Always include FULL file content for every upsert. Partial patches are not supported.
- Paths are relative (index.html, styles.css, app.js). Never use .., absolute paths, or dotfiles.
- Only valid JSON inside the fence. Escape content correctly.
- Outside the fence, write a short, plain summary of what you built or changed (1-3 sentences). No code dumps outside the fence.
- If the user asks a question instead of requesting changes, answer normally without file operations.

## Quality bar
- Ship complete, working features. No TODOs, no placeholder screens, no dead buttons.
- Make it look genuinely good: modern, clean, responsive, sensible spacing and typography, dark-mode friendly colors, useful empty states.
- When console errors are reported to you, find the root cause and fix it in the files.`;

type FileOperation = {
  action?: "upsert" | "delete";
  path?: string;
  content?: string;
};

function extractFileOperations(text: string) {
  const operations: FileOperation[] = [];
  const regex = /```file_operation\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      operations.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Ignore malformed blocks; the model's summary still gets saved.
    }
  }

  return operations.filter((op) => op.path && safePath(op.path));
}

export async function POST(req: NextRequest) {
  const { projectId, content } = await req.json();

  if (!projectId || !content?.trim()) {
    return new Response("Missing projectId or content", { status: 400 });
  }

  const result = await requireOwnedProject(projectId);
  if (!result.ok) return result.response;
  const { project } = result;

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("Missing OPENROUTER_API_KEY", { status: 500 });
  }

  await addMessage(projectId, "user", content.trim());

  const messages = await listMessages(projectId);
  const files = await listFiles(projectId);

  const fileTree =
    files.length > 0
      ? files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n")
      : "No files yet. Create the first version of the app from the user's request.";

  const history = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content),
  }));

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: project.model || DEFAULT_MODEL,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Current project files:\n\n${fileTree}` },
        ...history,
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`OpenRouter error: ${detail.slice(0, 300)}`, { status: 502 });
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffer = "";
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let finished = false;
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += new TextDecoder().decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              finished = true;
              break;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                controller.enqueue(encoder.encode(delta));
              }
            } catch {}
          }
        }

        for (const op of extractFileOperations(fullText)) {
          if (!op.path) continue;
          if (op.action === "delete") {
            await deleteFile(projectId, op.path);
          } else {
            await upsertFile(projectId, op.path, op.content ?? "");
          }
        }

        if (fullText.trim()) {
          await addMessage(projectId, "assistant", fullText);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
