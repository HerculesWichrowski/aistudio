import { describe, expect, test } from "bun:test";
import { parseAppData, parseRules } from "../rules";

describe("parseRules", () => {
  test("parses the canonical shape", () => {
    const rules = parseRules('{"tables":{"todos":{"fields":{"title":{"type":"string"}}}}}');
    expect(rules?.tables?.todos.fields?.title.type).toBe("string");
  });

  test("tolerates comments and BOM", () => {
    const rules = parseRules(
      '﻿{\n// comment\n"tables":{"t":{"fields":{}}} /* block */\n}'
    );
    expect(rules?.tables?.t).toBeDefined();
  });

  test("accepts a top-level schema key as alias", () => {
    const rules = parseRules('{"schema":{"users":{"fields":{}}}}');
    expect(rules?.tables?.users).toBeDefined();
  });

  test("treats unknown top-level objects as tables (legacy shape)", () => {
    const rules = parseRules('{"version":1,"todos":{"fields":{"done":{"type":"boolean"}}}}');
    expect(rules?.tables?.todos).toBeDefined();
    expect(rules?.tables?.version).toBeUndefined();
  });

  test("extracts JSON from a stray markdown fence", () => {
    const rules = parseRules('```json\n{"tables":{"x":{"fields":{}}}}\n```');
    expect(rules?.tables?.x).toBeDefined();
  });

  test("returns null for garbage or empty tables", () => {
    expect(parseRules("not json")).toBeNull();
    expect(parseRules('{"tables":{}}')).toBeNull();
    expect(parseRules("")).toBeNull();
    expect(parseRules(null)).toBeNull();
  });
});

describe("parseAppData", () => {
  test("parses valid data and defaults to empty object", () => {
    expect(parseAppData('{"todos":[{"id":"1"}]}')).toEqual({ todos: [{ id: "1" }] });
    expect(parseAppData("broken")).toEqual({});
    expect(parseAppData(null)).toEqual({});
  });
});
