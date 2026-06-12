import { stripVisiblePlanText } from "./builder";

export type BuildFileStatus = {
  path: string;
  status: "start" | "done" | "deleted" | "error";
  error?: string;
};

export type StoredFileOp = {
  action?: string;
  path: string;
  status?: "done" | "deleted" | "error" | "start";
  error?: string;
};

export const BUILD_EVENT_PREFIX = "\n@@";

export function parseBuilderStream(raw: string) {
  let chat = "";
  const byPath = new Map<string, BuildFileStatus>();
  let planDone = false;
  let i = 0;

  while (i < raw.length) {
    const marker = raw.indexOf(BUILD_EVENT_PREFIX, i);
    if (marker === -1) {
      chat += raw.slice(i);
      break;
    }

    chat += raw.slice(i, marker);
    const jsonStart = marker + BUILD_EVENT_PREFIX.length;
    let jsonEnd = raw.indexOf("\n", jsonStart);
    if (jsonEnd === -1) jsonEnd = raw.length;

    try {
      const event = JSON.parse(raw.slice(jsonStart, jsonEnd)) as {
        type?: string;
        status?: string;
        path?: string;
        error?: string;
      };

      if (event.type === "plan_done") {
        planDone = true;
      } else if (event.type === "file" && event.path && event.status) {
        byPath.set(event.path, {
          path: event.path,
          status: event.status as BuildFileStatus["status"],
          error: event.error,
        });
      }
    } catch {}

    i = jsonEnd === raw.length ? raw.length : jsonEnd + 1;
  }

  return {
    chat: stripVisiblePlanText(chat),
    events: [...byPath.values()],
    planDone,
  };
}

const FILE_OP_REGEX = /```file_operation\s*([\s\S]*?)```/g;

export function parseStoredFileOps(content: string) {
  const textParts: string[] = [];
  const ops: StoredFileOp[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(FILE_OP_REGEX)) {
    if (match.index !== undefined && match.index > lastIndex) {
      textParts.push(content.slice(lastIndex, match.index));
    }
    try {
      const parsed = JSON.parse(match[1].trim());
      for (const op of Array.isArray(parsed) ? parsed : [parsed]) {
        if (op?.path) ops.push(op as StoredFileOp);
      }
    } catch {}
    lastIndex = (match.index ?? 0) + match[0].length;
  }

  if (lastIndex < content.length) {
    textParts.push(content.slice(lastIndex));
  }

  const text = stripVisiblePlanText(textParts.join("")).trim();
  return { text, ops };
}
