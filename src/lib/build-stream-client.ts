export type BuildFileStatus = {
  path: string;
  status: "start" | "done" | "deleted" | "error";
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
    chat: chat.replace(/\n{3,}/g, "\n\n").trimEnd(),
    events: [...byPath.values()],
    planDone,
  };
}
