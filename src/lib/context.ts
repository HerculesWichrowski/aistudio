type VirtualFile = { path: string; content: string };

const ENTRY_FILES = ["index.html", "styles.css", "app.js", "database.rules.json"];

export type ContextSelection = {
  structure: string;
  contextBlock: string;
  includedPaths: string[];
  omittedPaths: string[];
};

/** Lists every file path — always cheap to include. */
export function buildFileStructure(files: VirtualFile[]): string {
  if (files.length === 0) return "(no files yet)";
  return files.map((file) => `- ${file.path} (${file.content.length} chars)`).join("\n");
}

/**
 * Picks file contents to inject into the model context.
 * Structure is always full; contents are selective by plan + entry files + budget.
 */
export function selectFileContext(
  files: VirtualFile[],
  options: {
    planPaths?: string[];
    sessionPaths?: string[];
    maxChars?: number;
  } = {}
): ContextSelection {
  const maxChars = options.maxChars ?? 96_000;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const structure = buildFileStructure(files);

  const wanted = new Set<string>();
  for (const path of ENTRY_FILES) {
    if (byPath.has(path)) wanted.add(path);
  }
  for (const path of options.planPaths ?? []) {
    if (byPath.has(path)) wanted.add(path);
  }
  for (const path of options.sessionPaths ?? []) {
    if (byPath.has(path)) wanted.add(path);
  }

  const included: VirtualFile[] = [];
  const omitted: string[] = [];
  let used = 0;

  for (const path of wanted) {
    const file = byPath.get(path)!;
    if (used + file.content.length > maxChars) {
      omitted.push(path);
      continue;
    }
    included.push(file);
    used += file.content.length;
  }

  const contextParts = [
    "## Project structure",
    structure,
    "",
    "## File contents (loaded into context)",
  ];

  if (included.length === 0) {
    contextParts.push("(none loaded — create files from the user's request)");
  } else {
    contextParts.push(
      included.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n")
    );
  }

  if (omitted.length > 0) {
    contextParts.push("", `(Omitted due to size limit: ${omitted.join(", ")})`);
  }

  const notLoaded = files.filter((file) => !included.some((item) => item.path === file.path));
  if (notLoaded.length > 0) {
    contextParts.push(
      "",
      `(Not loaded — structure only: ${notLoaded.map((file) => file.path).join(", ")})`
    );
  }

  return {
    structure,
    contextBlock: contextParts.join("\n"),
    includedPaths: included.map((file) => file.path),
    omittedPaths: omitted,
  };
}

/** Fresh context after files change mid-build (e.g. parallel generation finished one). */
export function mergeSessionPaths(existing: Set<string>, paths: string[]) {
  for (const path of paths) existing.add(path);
  return existing;
}
