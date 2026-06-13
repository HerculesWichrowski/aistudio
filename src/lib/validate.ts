import { parse } from "acorn";
import { parseRules } from "./rules";

export type ValidationResult = { ok: true } | { ok: false; error: string };

const OK: ValidationResult = { ok: true };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function validateJs(content: string): ValidationResult {
  try {
    parse(content, { ecmaVersion: "latest", sourceType: "module" });
    return OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Syntax error";
    return fail(`JavaScript syntax error: ${message}`);
  }
}

function validateJson(path: string, content: string): ValidationResult {
  try {
    JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return fail(`Invalid JSON: ${message}`);
  }

  if (path === "database.rules.json" && !parseRules(content)) {
    return fail(
      'database.rules.json must contain a top-level "tables" object: ' +
        '{"tables":{"name":{"fields":{...}}}}'
    );
  }
  return OK;
}

function validateHtml(content: string): ValidationResult {
  if (!/<html[\s>]|<!doctype\s+html/i.test(content)) {
    return fail("Not a complete HTML document (missing <!doctype html> / <html>)");
  }
  const opens = (content.match(/<body[\s>]/gi) ?? []).length;
  const closes = (content.match(/<\/body>/gi) ?? []).length;
  if (opens > 0 && closes === 0) {
    return fail("HTML document looks truncated (unclosed <body>)");
  }
  return OK;
}

/**
 * Static checks on a generated file before it is saved. Catches the common
 * failure modes of LLM file generation: truncation, syntax errors, and
 * malformed JSON — so they can be fixed by a corrective retry instead of
 * surfacing as runtime errors in the preview.
 */
export function validateGeneratedFile(path: string, content: string): ValidationResult {
  if (!content.trim()) return fail("File is empty");

  if (path.endsWith(".js") || path.endsWith(".mjs")) return validateJs(content);
  if (path.endsWith(".json")) return validateJson(path, content);
  if (path.endsWith(".html")) return validateHtml(content);
  return OK;
}
