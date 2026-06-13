import { describe, expect, test } from "bun:test";
import {
  collectImportSpecifiers,
  findMissingLocalImports,
  isBareSpecifier,
  packageRoot,
} from "../imports";

describe("collectImportSpecifiers", () => {
  test("collects default, named, side-effect, export-from and dynamic imports", () => {
    const code = `
import { LitElement, html } from 'lit';
import confetti from "canvas-confetti";
import '@app/components/app-shell.js';
export { thing } from './local.js';
const mod = await import("date-fns");
`;
    const specs = collectImportSpecifiers(code);
    expect(specs).toContain("lit");
    expect(specs).toContain("canvas-confetti");
    expect(specs).toContain("@app/components/app-shell.js");
    expect(specs).toContain("./local.js");
    expect(specs).toContain("date-fns");
  });

  test("ignores plain strings that are not imports", () => {
    const specs = collectImportSpecifiers(`const s = "lit"; console.log('from "x"');`);
    expect(specs).not.toContain("lit");
  });

  test("handles multi-line import statements", () => {
    const specs = collectImportSpecifiers(`import {\n  a,\n  b,\n} from 'nanoid';`);
    expect(specs).toContain("nanoid");
  });
});

describe("isBareSpecifier", () => {
  test("npm names are bare; local/url/data are not", () => {
    expect(isBareSpecifier("lit")).toBe(true);
    expect(isBareSpecifier("@scope/pkg/sub")).toBe(true);
    expect(isBareSpecifier("./x.js")).toBe(false);
    expect(isBareSpecifier("/x.js")).toBe(false);
    expect(isBareSpecifier("@app/lib/x.js")).toBe(false);
    expect(isBareSpecifier("https://esm.sh/lit")).toBe(false);
    expect(isBareSpecifier("data:text/javascript,1")).toBe(false);
  });
});

describe("packageRoot", () => {
  test("plain and scoped subpaths", () => {
    expect(packageRoot("lit/decorators.js")).toBe("lit");
    expect(packageRoot("lit")).toBe("lit");
    expect(packageRoot("@scope/pkg/sub/deep.js")).toBe("@scope/pkg");
  });
});

describe("findMissingLocalImports", () => {
  test("reports @app/ imports without a backing file, with importers", () => {
    const files = [
      { path: "app.js", content: `import '@app/components/a.js';\nimport '@app/lib/util.js';` },
      { path: "components/a.js", content: `import '@app/lib/util.js';` },
    ];
    const missing = findMissingLocalImports(files);
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe("lib/util.js");
    expect(missing[0].importers.sort()).toEqual(["app.js", "components/a.js"]);
  });

  test("empty when everything resolves", () => {
    const files = [
      { path: "app.js", content: `import '@app/components/a.js';` },
      { path: "components/a.js", content: `import { html } from 'lit';` },
    ];
    expect(findMissingLocalImports(files)).toHaveLength(0);
  });
});
