import { describe, expect, test } from "bun:test";
import { validateGeneratedFile } from "../validate";

describe("validateGeneratedFile", () => {
  test("accepts valid ES module syntax", () => {
    const result = validateGeneratedFile(
      "components/x.js",
      `import { LitElement, html } from 'lit';
export class X extends LitElement {
  render() { return html\`<p>ok</p>\`; }
}
customElements.define('x-el', X);`
    );
    expect(result.ok).toBe(true);
  });

  test("rejects truncated JavaScript with a line number", () => {
    const result = validateGeneratedFile("app.js", "function broken( {\n  const x =");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("syntax error");
  });

  test("rejects empty files", () => {
    expect(validateGeneratedFile("app.js", "  \n ").ok).toBe(false);
  });

  test("accepts top-level await (module mode)", () => {
    expect(validateGeneratedFile("app.js", "const rows = await window.db.list('t');").ok).toBe(
      true
    );
  });

  test("rejects invalid JSON", () => {
    expect(validateGeneratedFile("data.json", "{ nope }").ok).toBe(false);
  });

  test("rejects database.rules.json without a usable tables shape", () => {
    expect(validateGeneratedFile("database.rules.json", '{"tables": {}}').ok).toBe(false);
    const good = validateGeneratedFile(
      "database.rules.json",
      '{"tables":{"todos":{"fields":{"title":{"type":"string"}}}}}'
    );
    expect(good.ok).toBe(true);
  });

  test("rejects HTML without a document shell and truncated bodies", () => {
    expect(validateGeneratedFile("index.html", "<div>fragment</div>").ok).toBe(false);
    expect(
      validateGeneratedFile("index.html", "<!doctype html><html><body><p>cut off").ok
    ).toBe(false);
    expect(
      validateGeneratedFile(
        "index.html",
        "<!doctype html><html><head></head><body></body></html>"
      ).ok
    ).toBe(true);
  });

  test("css always passes (no validator)", () => {
    expect(validateGeneratedFile("styles.css", "body { color: red;").ok).toBe(true);
  });
});
