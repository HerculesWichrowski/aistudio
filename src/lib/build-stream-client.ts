import { stripVisiblePlanText } from "./plan";

export type BuildFileStatus = {
  path: string;
  status: "start" | "done" | "deleted" | "error";
  error?: string;
  draft?: string;
};

export type StoredFileOp = {
  action?: string;
  path: string;
  status?: "done" | "deleted" | "error" | "start";
  error?: string;
};

const FILE_OP_REGEX = /```file_operation\s*([\s\S]*?)```/g;

/** Splits a stored assistant message into visible text + file-operation chips. */
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
