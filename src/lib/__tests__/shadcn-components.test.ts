import { describe, expect, test } from "bun:test";
import { buildFileTree } from "@/lib/file-tree";
import {
  selectShadcnComponents,
  shadcnPackageName,
  shadcnTag,
} from "@/lib/shadcn-components";

describe("selectShadcnComponents", () => {
  test("picks dialog and form controls for modal form requests", () => {
    const { families } = selectShadcnComponents("Add a modal form to create new todos with validation");
    const ids = families.map((family) => family.id);
    expect(ids).toContain("dialog");
    expect(ids).toContain("input");
    expect(ids).toContain("button");
  });

  test("picks data-table for CRM-style requests", () => {
    const { families } = selectShadcnComponents("Build a CRM with sortable customer records table");
    const ids = families.map((family) => family.id);
    expect(ids).toContain("data-table");
  });

  test("picks switch for dark mode requests", () => {
    const { families } = selectShadcnComponents("Add a dark mode toggle in settings");
    expect(families.some((family) => family.id === "switch")).toBe(true);
  });

  test("includes baseline kit for brand-new apps", () => {
    const { families } = selectShadcnComponents("Build a flashcard trainer from scratch");
    const ids = families.map((family) => family.id);
    expect(ids).toContain("card");
    expect(ids).toContain("button");
  });
});

describe("shadcn helpers", () => {
  test("maps package and tag names", () => {
    expect(shadcnPackageName("button")).toBe("@shcnwc/shadcn-button-web-component");
    expect(shadcnTag("card-header")).toBe("shadcn-card-header");
  });
});

describe("buildFileTree", () => {
  test("nests paths into folders", () => {
    const tree = buildFileTree([
      { id: "1", path: "index.html", content: "" },
      { id: "2", path: "components/todo-app.js", content: "" },
      { id: "3", path: "components/ui/button.js", content: "" },
      { id: "4", path: "lib/format.js", content: "" },
    ]);

    expect(tree.map((node) => node.name)).toEqual(["components", "index.html", "lib"]);
    const components = tree.find((node) => node.kind === "folder" && node.name === "components");
    expect(components?.kind).toBe("folder");
    if (components?.kind === "folder") {
      expect(components.children.some((node) => node.name === "todo-app.js")).toBe(true);
      const ui = components.children.find((node) => node.kind === "folder" && node.name === "ui");
      expect(ui?.kind).toBe("folder");
    }
  });
});
