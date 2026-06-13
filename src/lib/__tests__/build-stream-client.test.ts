import { describe, expect, test } from "bun:test";
import { parseStoredFileOps } from "../build-stream-client";

describe("parseStoredFileOps", () => {
  test("splits visible text from file_operation chips", () => {
    const { text, ops } = parseStoredFileOps(
      'I added dark mode.\n\n```file_operation\n[{"action":"upsert","path":"styles.css","status":"done"}]\n```'
    );
    expect(text).toBe("I added dark mode.");
    expect(ops).toEqual([{ action: "upsert", path: "styles.css", status: "done" }]);
  });

  test("collects ops from multiple blocks and keeps surrounding text", () => {
    const { text, ops } = parseStoredFileOps(
      'a\n```file_operation\n{"path":"x.js","status":"done"}\n```\nb\n```file_operation\n{"path":"y.js","status":"error","error":"boom"}\n```'
    );
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(ops.map((op) => op.path)).toEqual(["x.js", "y.js"]);
    expect(ops[1].error).toBe("boom");
  });

  test("ignores malformed op blocks", () => {
    const { text, ops } = parseStoredFileOps("hello\n```file_operation\nnot json\n```");
    expect(text).toBe("hello");
    expect(ops).toHaveLength(0);
  });
});
