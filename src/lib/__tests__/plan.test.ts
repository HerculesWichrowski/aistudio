import { describe, expect, test } from "bun:test";
import {
  extractBuildPlan,
  extractFileOperations,
  extractPartialFileContent,
  formatAssistantReply,
  inferEditPaths,
  looksLikeEditRequest,
  planHasChanges,
  sanitizeHistoryForBuilder,
  sortGenerationPaths,
  stripVisiblePlanText,
} from "../plan";

describe("extractBuildPlan", () => {
  test("parses fenced plan with plain string paths", () => {
    const plan = extractBuildPlan(
      'Sure!\n```build_plan\n{"summary":"s","upsert":["index.html","app.js"],"delete":["old.js"]}\n```'
    );
    expect(plan).toEqual({
      summary: "s",
      upsert: ["index.html", "app.js"],
      delete: ["old.js"],
    });
  });

  test("parses fenced plan with {path, brief} entries", () => {
    const plan = extractBuildPlan(
      '```build_plan\n{"summary":"s","upsert":[{"path":"app.js","brief":"bootstrap"},{"path":"index.html"}],"delete":[]}\n```'
    );
    expect(plan?.upsert).toEqual(["app.js", "index.html"]);
    expect(plan?.briefs).toEqual({ "app.js": "bootstrap" });
  });

  test("deduplicates paths and drops empties", () => {
    const plan = extractBuildPlan(
      '```build_plan\n{"upsert":["a.js","a.js","",{"path":"b.js"}],"delete":[]}\n```'
    );
    expect(plan?.upsert).toEqual(["a.js", "b.js"]);
  });

  test("parses <build_plan> XML-style block", () => {
    const plan = extractBuildPlan(
      '<build_plan>{"summary":"x","upsert":["styles.css"],"delete":[]}</build_plan>'
    );
    expect(plan?.upsert).toEqual(["styles.css"]);
  });

  test("parses tool_call arg format", () => {
    const plan = extractBuildPlan(
      "<tool_call>build_plan<arg_key>summary</arg_key><arg_value>s</arg_value>" +
        '<arg_key>upsert</arg_key><arg_value>["app.js"]</arg_value></tool_call>'
    );
    expect(plan?.upsert).toEqual(["app.js"]);
  });

  test("recovers bare JSON without fences", () => {
    const plan = extractBuildPlan('here you go {"summary":"s","upsert":["x.js"],"delete":[]}');
    expect(plan?.upsert).toEqual(["x.js"]);
  });

  test("recovers unfenced JSON with object entries and nested braces", () => {
    const plan = extractBuildPlan(
      'Sure {ok} — {"summary":"fix {thing}","upsert":[{"path":"a.js","brief":"uses {x: 1} shape"}],"delete":[]}'
    );
    expect(plan?.upsert).toEqual(["a.js"]);
    expect(plan?.briefs?.["a.js"]).toBe("uses {x: 1} shape");
  });

  test("returns null when no plan present", () => {
    expect(extractBuildPlan("Just a chat answer with no plan.")).toBeNull();
  });
});

describe("planHasChanges", () => {
  test("false for null and empty plans", () => {
    expect(planHasChanges(null)).toBe(false);
    expect(planHasChanges({ upsert: [], delete: [] })).toBe(false);
  });

  test("true when upsert or delete has entries", () => {
    expect(planHasChanges({ upsert: ["a"], delete: [] })).toBe(true);
    expect(planHasChanges({ upsert: [], delete: ["a"] })).toBe(true);
  });
});

describe("sortGenerationPaths", () => {
  test("orders dependencies before entry points", () => {
    expect(
      sortGenerationPaths([
        "index.html",
        "app.js",
        "components/b.js",
        "lib/a.js",
        "styles.css",
        "database.rules.json",
        "components/a.js",
      ])
    ).toEqual([
      "database.rules.json",
      "lib/a.js",
      "components/a.js",
      "components/b.js",
      "styles.css",
      "app.js",
      "index.html",
    ]);
  });
});

describe("stripVisiblePlanText", () => {
  test("removes plan fences, tool calls, and trailing partial fences", () => {
    expect(
      stripVisiblePlanText('Building now.\n```build_plan\n{"upsert":[]}\n```')
    ).toBe("Building now.");
    expect(stripVisiblePlanText("Hi\n```build_plan\n{partial")).toBe("Hi");
    expect(stripVisiblePlanText("Hi <tool_call>build_plan stuff</tool_call> there")).toBe(
      "Hi  there"
    );
    expect(stripVisiblePlanText("Streaming text\n```file:app.js\nconst x")).toBe(
      "Streaming text"
    );
  });
});

describe("looksLikeEditRequest", () => {
  test("any message counts when project has no files", () => {
    expect(looksLikeEditRequest("hello", false)).toBe(true);
  });

  test("questions without edit verbs are not edits", () => {
    expect(looksLikeEditRequest("how does window.db work?", true)).toBe(false);
  });

  test("edit verbs are edits", () => {
    expect(looksLikeEditRequest("please add a dark mode toggle", true)).toBe(true);
  });
});

describe("inferEditPaths", () => {
  const files = [
    { path: "index.html", content: "" },
    { path: "styles.css", content: "" },
    { path: "app.js", content: "" },
    { path: "components/todo-list.js", content: "" },
    { path: "components/app-shell.js", content: "" },
  ];

  test("style words target styles.css", () => {
    expect(inferEditPaths("make the background dark", files)).toContain("styles.css");
  });

  test("component name words target the matching component", () => {
    const paths = inferEditPaths("the todo list button is broken", files);
    expect(paths).toContain("components/todo-list.js");
  });

  test("empty project gets the default scaffold", () => {
    expect(inferEditPaths("make me an app", [])).toEqual([
      "index.html",
      "styles.css",
      "app.js",
      "components/app-shell.js",
    ]);
  });
});

describe("extractFileOperations", () => {
  test("extracts raw file fences", () => {
    const ops = extractFileOperations(
      '```file:app.js\nconsole.log("hi");\n```\n\n```file:styles.css\nbody{}\n```'
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      action: "upsert",
      path: "app.js",
      content: 'console.log("hi");\n',
    });
  });

  test("rejects unsafe paths", () => {
    const ops = extractFileOperations("```file:../evil.js\nhack\n```");
    expect(ops).toHaveLength(0);
  });

  test("falls back to file_operation JSON fences", () => {
    const ops = extractFileOperations(
      '```file_operation\n[{"action":"upsert","path":"a.js","content":"x"}]\n```'
    );
    expect(ops).toEqual([{ action: "upsert", path: "a.js", content: "x" }]);
  });
});

describe("extractPartialFileContent", () => {
  test("returns streamed body before the fence closes", () => {
    expect(extractPartialFileContent("```file:app.js\nconst a = 1;", "app.js")).toBe(
      "const a = 1;"
    );
  });

  test("returns full body once closed", () => {
    expect(extractPartialFileContent("```file:app.js\nconst a = 1;\n```", "app.js")).toBe(
      "const a = 1;"
    );
  });

  test("null when the file fence has not started", () => {
    expect(extractPartialFileContent("thinking...", "app.js")).toBeNull();
  });
});

describe("formatAssistantReply", () => {
  test("appends a file_operation block including failures with errors", () => {
    const reply = formatAssistantReply("Done!", {
      deleted: ["old.js"],
      updated: ["app.js"],
      failed: [{ path: "bad.js", error: "syntax error" }],
    });
    expect(reply).toStartWith("Done!");
    expect(reply).toContain('"path":"old.js"');
    expect(reply).toContain('"status":"done"');
    expect(reply).toContain('"error":"syntax error"');
  });
});

describe("sanitizeHistoryForBuilder", () => {
  test("strips machine blocks from assistant turns only", () => {
    const history = sanitizeHistoryForBuilder([
      { role: "user", content: "```file_operation\nkeep me\n```" },
      {
        role: "assistant",
        content: 'Did it\n\n```file_operation\n[{"path":"a.js"}]\n```',
      },
    ]);
    expect(history[0].content).toContain("keep me");
    expect(history[1].content).toBe("Did it");
  });
});
