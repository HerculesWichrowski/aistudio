import { describe, expect, test } from "bun:test";
import { selectFileContext } from "../context";

describe("selectFileContext", () => {
  const files = [
    { path: "index.html", content: "<html>" },
    { path: "styles.css", content: "body{}" },
    { path: "components/a.js", content: "export const a = 1;" },
    { path: "notes.txt", content: "scratch" },
  ];

  test("always lists every file in the structure", () => {
    const { structure } = selectFileContext(files);
    for (const file of files) expect(structure).toContain(file.path);
  });

  test("loads entry files and components, leaves non-entry files as structure-only", () => {
    const { includedPaths, contextBlock } = selectFileContext(files);
    expect(includedPaths).toContain("index.html");
    expect(includedPaths).toContain("components/a.js");
    expect(includedPaths).not.toContain("notes.txt");
    expect(contextBlock).toContain("Not loaded — structure only: notes.txt");
  });

  test("plan paths force-load non-entry files", () => {
    const { includedPaths } = selectFileContext(files, { planPaths: ["notes.txt"] });
    expect(includedPaths).toContain("notes.txt");
  });

  test("the char budget omits files instead of overflowing", () => {
    const big = [
      { path: "components/big.js", content: "x".repeat(120) },
      { path: "components/small.js", content: "y".repeat(10) },
    ];
    const { includedPaths, omittedPaths } = selectFileContext(big, { maxChars: 50 });
    expect(includedPaths).toEqual(["components/small.js"]);
    expect(omittedPaths).toEqual(["components/big.js"]);
  });
});
