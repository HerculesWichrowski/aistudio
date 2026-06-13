"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode, Folder } from "lucide-react";
import { buildFileTree, type FileTreeNode } from "@/lib/file-tree";
import type { ProjectFile } from "./types";

type FileTreeProps = {
  files: ProjectFile[];
  selectedPath: string;
  onPickFile: (file: ProjectFile) => void;
};

function TreeNodeRow({
  node,
  depth,
  selectedPath,
  collapsed,
  onToggleFolder,
  onPickFile,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string;
  collapsed: Set<string>;
  onToggleFolder: (path: string) => void;
  onPickFile: (file: ProjectFile) => void;
}) {
  if (node.kind === "file") {
    return (
      <button
        className={`file-row file-tree-row ${selectedPath === node.path ? "active" : ""}`}
        onClick={() => onPickFile(node.file)}
        style={{ paddingLeft: 9 + depth * 14 }}
        title={node.path}
        type="button"
      >
        <FileCode size={13} />
        <span>{node.name}</span>
      </button>
    );
  }

  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        className="file-row file-tree-row file-tree-folder"
        onClick={() => onToggleFolder(node.path)}
        style={{ paddingLeft: 9 + depth * 14 }}
        title={node.path}
        type="button"
      >
        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Folder size={13} />
        <span>{node.name}</span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeNodeRow
            collapsed={collapsed}
            depth={depth + 1}
            key={child.path}
            node={child}
            onPickFile={onPickFile}
            onToggleFolder={onToggleFolder}
            selectedPath={selectedPath}
          />
        ))}
    </>
  );
}

export default function FileTree({ files, selectedPath, onPickFile }: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggleFolder(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <>
      {tree.map((node) => (
        <TreeNodeRow
          collapsed={collapsed}
          depth={0}
          key={node.path}
          node={node}
          onPickFile={onPickFile}
          onToggleFolder={toggleFolder}
          selectedPath={selectedPath}
        />
      ))}
    </>
  );
}
