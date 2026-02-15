import { useState } from "react";
import type { TreeNode } from "../api";
import { TYPE_ICONS } from "../utils/constants";
import "./TreeView.css";

interface TreeItemProps {
  node: TreeNode;
  currentPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (path: string) => void;
  onCreatePage: (parentPath: string) => void;
  depth: number;
}

function TreeItem({
  node,
  currentPath,
  dirtyPaths,
  onSelect,
  onCreatePage,
  depth,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isDir = hasChildren || (node.path && node.path.endsWith("_index.md"));
  const icon = node.type ? TYPE_ICONS[node.type] || "\u{1F4C4}" : "\u{1F4C1}";
  const isActive = node.path === currentPath;
  const isDirty = node.path ? dirtyPaths.has(node.path) : false;

  const handleClick = () => {
    if (node.path) {
      onSelect(node.path);
    }
    if (isDir) {
      setExpanded((prev) => !prev);
    }
  };

  // Derive the directory path for creating child pages
  const dirPath = node.path
    ? node.path.endsWith("_index.md")
      ? node.path.replace(/_index\.md$/, "")
      : node.path.replace(/[^/]*$/, "")
    : node.name + "/";

  return (
    <div className="tree-item">
      <div className="tree-item-row">
        <button
          className={`tree-item-label ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={handleClick}
        >
          {isDir && (
            <span className={`tree-chevron ${expanded ? "expanded" : ""}`}>
              {"\u25B6"}
            </span>
          )}
          <span className="tree-icon">{icon}</span>
          <span className="tree-title">{node.title || node.name}</span>
          {isDirty && <span className="tree-dirty-dot" title="Uncommitted changes" />}
        </button>
        {isDir && (
          <button
            className="tree-add-btn"
            title={`New page in ${node.title || node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onCreatePage(dirPath);
            }}
          >
            +
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.path || child.name}
              node={child}
              currentPath={currentPath}
              dirtyPaths={dirtyPaths}
              onSelect={onSelect}
              onCreatePage={onCreatePage}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeViewProps {
  tree: TreeNode[];
  currentPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (path: string) => void;
  onCreatePage: (parentPath: string) => void;
}

export default function TreeView({
  tree,
  currentPath,
  dirtyPaths,
  onSelect,
  onCreatePage,
}: TreeViewProps) {
  return (
    <div className="tree-view">
      {tree.map((node) => (
        <TreeItem
          key={node.path || node.name}
          node={node}
          currentPath={currentPath}
          dirtyPaths={dirtyPaths}
          onSelect={onSelect}
          onCreatePage={onCreatePage}
          depth={0}
        />
      ))}
    </div>
  );
}
