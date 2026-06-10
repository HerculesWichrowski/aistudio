import { NextRequest } from "next/server";
import { initDB } from "@/lib/db";
import { addMessage, deleteFile, listFiles, listMessages, upsertFile } from "@/lib/projects";

export const runtime = "edge";

const SYSTEM_PROMPT = `You are the app builder inside a small aistudio-style product. The user chats with you to create and maintain a complete small web app made of files.

Your job:
- Understand the request, inspect the current files included in context, and produce concrete file changes.
- Build complete, working implementations for small apps. Do not leave TODOs, fake data flows, or placeholder screens unless the user explicitly asks for a sketch.
- Prefer simple Next.js App Router React, TypeScript, and CSS that fits in the files you create.
- Keep apps self-contained and easy to reason about. Avoid unnecessary dependencies.
- Make UI feel polished, direct, and useful on desktop and mobile.

File protocol:
When creating, updating, or deleting files, output one fenced JSON block exactly like this:

\`\`\`file_operation
[{"action":"upsert","path":"src/app/page.tsx","content":"...complete file content..."},{"action":"delete","path":"src/old.tsx"}]
\`\`\`

Rules:
- Always include full file content for every upsert. Partial patches are not supported.
- Use paths relative to the project root, such as src/app/page.tsx, src/app/globals.css, package.json, or README.md.
- Never use paths with .., absolute paths, or hidden system files.
- Put only valid JSON inside file_operation fences.
- After the file_operation block, briefly explain what changed and how to run or inspect it.
- If the user asks a question instead of requesting changes, answer normally and do not emit file operations.`;

type FileOperation = {
  action?: "upsert" | "delete";
  path?: string;
  content?: string;
};

function safePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.startsWith(".") &&
    !path.includes("\\")
  );
}

function extractFileOperations(text: string) {
  const operations: FileOperation[] = [];
  const regex = /```file_operation\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      operations.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      operations.push({
        action: "upsert",
        path: "AI_OUTPUT_PARSE_ERROR.txt",
        content: "The assistant emitted an invalid file_operation JSON block.",
      });
    }
  }

  return operations.filter((op) => op.path && safePath(op.path));
}

export async function POST(req: NextRequest) {
  await initDB();
  const { projectId, content, model = "openrouter/owl-alpha" } = await req.json();

  if (!projectId || !content?.trim()) {
    return new Response("Missing projectId or content", { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("Missing OPENROUTER_API_KEY", { status: 500 });
  }

  await addMessage(projectId, "user", content.trim());

  const messages = await listMessages(projectId);
  const files = await listFiles(projectId);

  const fileTree = files.length > 0
    ? files.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n")
    : "No files yet. Create the first useful app files from the user's request.";

  const history = messages.map((m: any) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const stream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Current project files:\n\n${fileTree}` },
        ...history,
      ],
    }),
  });

  if (!stream.ok) {
    return new Response("OpenRouter error", { status: 502 });
  }

  const encoder = new TextEncoder();
  const reader = stream.body!.getReader();
  let buffer = "";
  let fullText = "";

  const newStream = new ReadableStream({
    async start(controller) {
      try {
        let finished = false;
        while (true) {
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
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                controller.enqueue(encoder.encode(content));
              }
            } catch {}
          }

          if (finished) break;
        }

        const operations = extractFileOperations(fullText);
        for (const op of operations) {
          if (!op.path) continue;
          if (op.action === "delete") {
            await deleteFile(projectId, op.path);
          } else {
            await upsertFile(projectId, op.path, op.content ?? "");
          }
        }

        await addMessage(projectId, "assistant", fullText);
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(newStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
 },
  });
}
