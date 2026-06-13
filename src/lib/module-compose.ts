import {
  APP_IMPORT_PREFIX,
  collectImportSpecifiers,
  isBareSpecifier,
  packageRoot,
} from "./imports";

export { APP_IMPORT_PREFIX } from "./imports";

type VirtualFile = { path: string; content: string };

function moduleDataUrl(code: string) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
}

function readHtmlImportMap(html: string) {
  const match = html.match(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return {};
  try {
    return ((JSON.parse(match[1]) as { imports?: Record<string, string> }).imports) ?? {};
  } catch {
    return {};
  }
}

function stripHtmlImportMap(html: string) {
  return html.replace(/<script[^>]+type=["']importmap["'][^>]*>[\s\S]*?<\/script>\s*/gi, "");
}

function normalizeLocalPath(src: string) {
  return src.replace(/^\.\//, "").replace(/^\//, "");
}

function buildAppImportMap(files: VirtualFile[]) {
  const imports: Record<string, string> = {};
  for (const file of files) {
    if (file.path.endsWith(".js")) {
      imports[`${APP_IMPORT_PREFIX}${file.path}`] = moduleDataUrl(file.content);
    }
  }
  return imports;
}

/**
 * Fills import-map gaps for bare npm specifiers used by the app's JS.
 * Models routinely import a package without updating the import map in
 * index.html; instead of a "Failed to resolve module specifier" runtime
 * crash, missing entries are pointed at esm.sh (reusing the mapped package
 * root's pinned version for subpath imports when available).
 */
export function autoResolveBareImports(
  files: VirtualFile[],
  imports: Record<string, string>
) {
  const resolved = { ...imports };

  for (const file of files) {
    if (!file.path.endsWith(".js")) continue;
    for (const spec of collectImportSpecifiers(file.content)) {
      if (!isBareSpecifier(spec) || resolved[spec]) continue;

      const root = packageRoot(spec);
      // Trailing-slash mappings ("lit/": "https://…/") already cover subpaths.
      if (spec !== root && resolved[`${root}/`]) continue;

      if (spec !== root && resolved[root]) {
        resolved[spec] = `${resolved[root].replace(/\/+$/, "")}${spec.slice(root.length)}`;
      } else {
        resolved[spec] = `https://esm.sh/${spec}`;
      }
    }
  }

  return resolved;
}

/** Resolve local ES modules via an import map and @app/ specifiers. */
export function injectModuleLoader(html: string, files: VirtualFile[]) {
  const htmlImports = readHtmlImportMap(html);
  const mergedImports = autoResolveBareImports(files, {
    ...htmlImports,
    ...buildAppImportMap(files),
  });
  let out = stripHtmlImportMap(html);

  out = out.replace(
    /<script\b([^>]*)\btype=["']module["']([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (_tag, _a, _b, src) => {
      if (/^https?:|^\/\//i.test(src)) {
        return `<script type="module" src="${src}"></script>`;
      }
      const path = normalizeLocalPath(src);
      if (!files.some((file) => file.path === path)) {
        return `<script type="module" src="${src}"></script>`;
      }
      return `<script type="module">\nimport "${APP_IMPORT_PREFIX}${path}";\n</script>`;
    }
  );

  const importMapBlock = `<script type="importmap">\n${JSON.stringify({ imports: mergedImports }, null, 2)}\n</script>\n`;

  if (/<head[^>]*>/i.test(out)) {
    return out.replace(/<head[^>]*>/i, (head) => `${head}\n${importMapBlock}`);
  }
  return importMapBlock + out;
}
