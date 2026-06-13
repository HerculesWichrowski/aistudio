import type { ProjectFile } from "@/components/workspace/types";

export type FileTreeNode =
  | { kind: "folder"; name: string; path: string; children: FileTreeNode[] }
  | { kind: "file"; name: string; path: string; file: ProjectFile };

export function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split("/");
    let level = root;

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]!;
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");

      if (isFile) {
        level.push({ kind: "file", name, path, file });
        continue;
      }

      let folder = level.find(
        (node): node is Extract<FileTreeNode, { kind: "folder" }> =>
          node.kind === "folder" && node.name === name
      );
      if (!folder) {
        folder = { kind: "folder", name, path, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
  }

  return root;
}
