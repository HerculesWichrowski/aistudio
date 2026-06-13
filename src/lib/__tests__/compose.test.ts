import { describe, expect, test } from "bun:test";
import { composeApp } from "../compose";

const ORIGIN = "https://studio.example";

describe("composeApp", () => {
  test("inlines local stylesheets and classic scripts", () => {
    const html = composeApp(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><script src="legacy.js"></script></body></html>`,
        },
        { path: "styles.css", content: "body { background: black; }" },
        { path: "legacy.js", content: "console.log('legacy');" },
      ],
      ORIGIN,
      "proj1"
    );

    expect(html).toContain("body { background: black; }");
    expect(html).toContain("console.log('legacy');");
    expect(html).not.toContain('href="styles.css"');
  });

  test("injects the runtime (console, window.ai, window.db, inspect) into head", () => {
    const html = composeApp(
      [{ path: "index.html", content: "<!doctype html><html><head></head><body></body></html>" }],
      ORIGIN,
      "proj1"
    );

    expect(html).toContain(ORIGIN);
    expect(html).toContain("/api/app-ai");
    expect(html).toContain("/api/app-data");
    expect(html).toContain('"proj1"');
    expect(html).toContain("window.ai");
    expect(html).toContain("window.db");
    expect(html).toContain('type !== "inspect"');
  });

  test("keeps remote stylesheets untouched", () => {
    const html = composeApp(
      [
        {
          path: "index.html",
          content: `<html><head><link rel="stylesheet" href="https://cdn.example/x.css"></head><body></body></html>`,
        },
      ],
      ORIGIN,
      "p"
    );
    expect(html).toContain('href="https://cdn.example/x.css"');
  });

  test("serves a placeholder when there are no files", () => {
    const html = composeApp([], ORIGIN, "p");
    expect(html).toContain("no files yet");
  });

  test("falls back to any html file when index.html is missing", () => {
    const html = composeApp(
      [{ path: "main.html", content: "<!doctype html><html><body>alt entry</body></html>" }],
      ORIGIN,
      "p"
    );
    expect(html).toContain("alt entry");
  });
});
