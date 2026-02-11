import { useCallback, useEffect, useRef, useState } from "react";
import MilkdownEditor from "./components/MilkdownEditor";
import TreeView from "./components/TreeView";
import TasksView from "./components/TasksView";
import CreatePageDialog from "./components/CreatePageDialog";
import {
  createPage,
  getNote,
  getTree,
  saveNote,
  type TreeNode,
} from "./api";
import "./App.css";

function extractFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return meta;
}

function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [noteType, setNoteType] = useState<string>("note");
  const [loading, setLoading] = useState(true);
  const [createTarget, setCreateTarget] = useState<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const refreshTree = useCallback(async () => {
    const data = await getTree();
    setTree(data.children);
  }, []);

  useEffect(() => {
    refreshTree().finally(() => setLoading(false));
  }, [refreshTree]);

  const openNote = useCallback(async (path: string) => {
    const note = await getNote(path);
    setContent(note.content);
    setCurrentPath(path);
    const meta = extractFrontmatter(note.content);
    setNoteType(typeof meta.type === "string" ? meta.type : "note");
  }, []);

  const handleChange = useCallback((markdown: string) => {
    contentRef.current = markdown;
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentPath) return;
    await saveNote(currentPath, contentRef.current);
    await refreshTree();
  }, [currentPath, refreshTree]);

  const handleTaskToggle = useCallback(
    (lineIndex: number) => {
      const lines = contentRef.current.split("\n");
      const line = lines[lineIndex];
      if (line.includes("- [x]") || line.includes("- [X]")) {
        lines[lineIndex] = line.replace(/- \[[xX]\]/, "- [ ]");
      } else if (line.includes("- [ ]")) {
        lines[lineIndex] = line.replace("- [ ]", "- [x]");
      }
      const updated = lines.join("\n");
      contentRef.current = updated;
      setContent(updated);
      if (currentPath) {
        saveNote(currentPath, updated);
      }
    },
    [currentPath]
  );

  const handleCreatePage = useCallback(
    async (title: string, type: string) => {
      if (!createTarget) return;
      const result = await createPage(createTarget, title, type);
      setCreateTarget(null);
      await refreshTree();
      await openNote(result.path);
    },
    [createTarget, refreshTree, openNote]
  );

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const renderEditor = () => {
    if (!currentPath) {
      return (
        <div className="placeholder">
          <p>Select a note to start editing</p>
        </div>
      );
    }

    if (noteType === "tasks") {
      return (
        <>
          <div className="editor-toolbar">
            <span className="editor-path">{currentPath}</span>
            <div className="toolbar-actions">
              <span className="type-badge tasks">Tasks</span>
              <button
                className="toolbar-btn"
                onClick={() => setNoteType("note")}
              >
                Edit Raw
              </button>
              <button className="save-btn" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
          <div className="editor-wrapper">
            <TasksView content={content} onToggle={handleTaskToggle} />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="editor-toolbar">
          <span className="editor-path">{currentPath}</span>
          <div className="toolbar-actions">
            {noteType !== "note" && (
              <span className={`type-badge ${noteType}`}>{noteType}</span>
            )}
            <button className="save-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
        <div className="editor-wrapper">
          <MilkdownEditor
            key={currentPath}
            defaultValue={content}
            onChange={handleChange}
          />
        </div>
      </>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Chronicle</h1>
          <button
            className="sidebar-add-btn"
            title="New page in root"
            onClick={() => setCreateTarget("")}
          >
            +
          </button>
        </div>
        <nav className="sidebar-nav">
          <TreeView
            tree={tree}
            currentPath={currentPath}
            onSelect={openNote}
            onCreatePage={setCreateTarget}
          />
        </nav>
      </aside>
      <main className="editor-area">{renderEditor()}</main>
      {createTarget !== null && (
        <CreatePageDialog
          parentPath={createTarget}
          onSubmit={handleCreatePage}
          onClose={() => setCreateTarget(null)}
        />
      )}
    </div>
  );
}

export default App;
