import { describe, expect, test } from "bun:test";
import { autoResolveBareImports, injectModuleLoader } from "../module-compose";

function importMapOf(html: string) {
  const match = html.match(/<script type="importmap">\n([\s\S]*?)\n<\/script>/);
  expect(match).not.toBeNull();
  return (JSON.parse(match![1]) as { imports: Record<string, string> }).imports;
}

describe("injectModuleLoader", () => {
  const html = `<!doctype html><html><head>
<script type="importmap">{"imports":{"lit":"https://esm.sh/lit@3.3.1"}}</script>
</head><body>
<script type="module" src="app.js"></script>
</body></html>`;

  test("maps local js files to @app/ data URLs and rewrites the entry script", () => {
    const out = injectModuleLoader(html, [
      { path: "app.js", content: "import '@app/components/a.js';" },
      { path: "components/a.js", content: "export const a = 1;" },
    ]);

    const imports = importMapOf(out);
    expect(imports["@app/app.js"]).toStartWith("data:text/javascript");
    expect(imports["@app/components/a.js"]).toStartWith("data:text/javascript");
    expect(out).toContain('import "@app/app.js";');
    expect(out).not.toContain('src="app.js"');
  });

  test("keeps remote module scripts untouched", () => {
    const out = injectModuleLoader(
      `<html><head></head><body><script type="module" src="https://cdn.example/x.js"></script></body></html>`,
      []
    );
    expect(out).toContain('src="https://cdn.example/x.js"');
  });

  test("preserves the page's own import map entries", () => {
    const out = injectModuleLoader(html, [{ path: "app.js", content: "import 'lit';" }]);
    expect(importMapOf(out)["lit"]).toBe("https://esm.sh/lit@3.3.1");
  });
});

describe("autoResolveBareImports", () => {
  test("adds esm.sh entries for unmapped bare imports", () => {
    const imports = autoResolveBareImports(
      [{ path: "app.js", content: "import confetti from 'canvas-confetti';" }],
      {}
    );
    expect(imports["canvas-confetti"]).toBe("https://esm.sh/canvas-confetti");
  });

  test("derives subpaths from the mapped (pinned) package root", () => {
    const imports = autoResolveBareImports(
      [{ path: "a.js", content: "import { state } from 'lit/decorators.js';" }],
      { lit: "https://esm.sh/lit@3.3.1" }
    );
    expect(imports["lit/decorators.js"]).toBe("https://esm.sh/lit@3.3.1/decorators.js");
  });

  test("respects trailing-slash scope mappings", () => {
    const imports = autoResolveBareImports(
      [{ path: "a.js", content: "import 'lit/directives/repeat.js';" }],
      { "lit/": "https://esm.sh/lit@3.3.1/" }
    );
    expect(imports["lit/directives/repeat.js"]).toBeUndefined();
  });

  test("handles scoped packages", () => {
    const imports = autoResolveBareImports(
      [{ path: "a.js", content: "import '@lit/reactive-element/css-tag.js';" }],
      {}
    );
    expect(imports["@lit/reactive-element/css-tag.js"]).toBe(
      "https://esm.sh/@lit/reactive-element/css-tag.js"
    );
  });

  test("never overrides existing exact mappings", () => {
    const imports = autoResolveBareImports(
      [{ path: "a.js", content: "import 'lit';" }],
      { lit: "https://esm.sh/lit@2.0.0" }
    );
    expect(imports["lit"]).toBe("https://esm.sh/lit@2.0.0");
  });

  test("skips @app/ and relative specifiers", () => {
    const imports = autoResolveBareImports(
      [{ path: "a.js", content: "import '@app/lib/x.js'; import './y.js';" }],
      {}
    );
    expect(Object.keys(imports)).toHaveLength(0);
  });
});
