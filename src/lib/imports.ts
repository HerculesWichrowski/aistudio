/** Static-analysis helpers for ES module imports in generated app code. */

export const APP_IMPORT_PREFIX = "@app/";

// The optional from-clause must not cross quotes or semicolons, or a
// side-effect import would swallow the next statement's specifier.
const STATIC_IMPORT_RE =
  /(?:^|[\n;{])\s*(?:import|export)\s+(?:[^"';]{0,300}?\bfrom\s+)?["']([^"'\n]+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;

/** All module specifiers statically imported/exported by a JS source. */
export function collectImportSpecifiers(code: string): string[] {
  const specs = new Set<string>();
  for (const match of code.matchAll(STATIC_IMPORT_RE)) specs.add(match[1]);
  for (const match of code.matchAll(DYNAMIC_IMPORT_RE)) specs.add(match[1]);
  return [...specs];
}

export function isBareSpecifier(spec: string) {
  return (
    !spec.startsWith(".") &&
    !spec.startsWith("/") &&
    !spec.startsWith(APP_IMPORT_PREFIX) &&
    !/^(https?:|data:|blob:|node:)/i.test(spec)
  );
}

/** `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`. */
export function packageRoot(spec: string) {
  const parts = spec.split("/");
  if (spec.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0];
}

type VirtualFile = { path: string; content: string };

/** Local `@app/...` imports that don't resolve to an existing project file. */
export function findMissingLocalImports(files: VirtualFile[]) {
  const existing = new Set(files.map((file) => file.path));
  const missing = new Map<string, string[]>();

  for (const file of files) {
    if (!file.path.endsWith(".js")) continue;
    for (const spec of collectImportSpecifiers(file.content)) {
      if (!spec.startsWith(APP_IMPORT_PREFIX)) continue;
      const path = spec.slice(APP_IMPORT_PREFIX.length);
      if (existing.has(path)) continue;
      const importers = missing.get(path) ?? [];
      importers.push(file.path);
      missing.set(path, importers);
    }
  }

  return [...missing.entries()].map(([path, importers]) => ({ path, importers }));
}
