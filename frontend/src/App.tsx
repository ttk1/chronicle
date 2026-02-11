import { useCallback, useEffect, useRef, useState } from "react";
import MilkdownEditor from "./components/MilkdownEditor";
import TreeView from "./components/TreeView";
import TasksView from "./components/TasksView";
import CreatePageDialog from "./components/CreatePageDialog";
import SearchPanel from "./components/SearchPanel";
import GitCommitDialog from "./components/GitCommitDialog";
import GitHistoryPanel from "./components/GitHistoryPanel";
import CalendarView from "./components/CalendarView";
import KanbanView from "./components/KanbanView";
import AutocompletePopup, {
  type AutocompleteItem,
} from "./components/AutocompletePopup";
import {
  createPage,
  getAssetIndex,
  getNote,
  getPageIndex,
  getTree,
  saveNote,
  type AssetItem,
  type PageIndexItem,
  type TreeNode,
} from "./api";
import { computeRelativePath } from "./utils/relativePath";
import "./App.css";

const TYPE_ICONS: Record<string, string> = {
  note: "\u{1F4DD}",
  daily: "\u{1F4C5}",
  tasks: "\u{2705}",
  kanban: "\u{1F4CB}",
};

function splitFrontmatter(content: string): {
  raw: string;
  body: string;
  meta: Record<string, unknown>;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { raw: "", body: content, meta: {} };
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { raw: match[0], body: content.slice(match[0].length), meta };
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

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<{
    mode: "link" | "image";
    position: { top: number; left: number };
    items: AutocompleteItem[];
  } | null>(null);
  const [pageIndex, setPageIndex] = useState<PageIndexItem[]>([]);
  const [assetIndex, setAssetIndex] = useState<AssetItem[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [calendarMode, setCalendarMode] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [frontmatterRaw, setFrontmatterRaw] = useState<string>("");

  const refreshTree = useCallback(async () => {
    const data = await getTree();
    setTree(data.children);
  }, []);

  const refreshIndexes = useCallback(async () => {
    const [pages, assets] = await Promise.all([
      getPageIndex(),
      getAssetIndex(),
    ]);
    setPageIndex(pages);
    setAssetIndex(assets);
  }, []);

  useEffect(() => {
    Promise.all([refreshTree(), refreshIndexes()]).finally(() =>
      setLoading(false)
    );
  }, [refreshTree, refreshIndexes]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchMode((prev) => !prev);
        setHistoryMode(false);
        setCalendarMode(false);
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const openNote = useCallback(async (path: string) => {
    const note = await getNote(path);
    const { raw, body, meta } = splitFrontmatter(note.content);
    setFrontmatterRaw(raw);
    setContent(body);
    setCurrentPath(path);
    setNoteType(typeof meta.type === "string" ? meta.type : "note");
  }, []);

  const handleChange = useCallback((markdown: string) => {
    contentRef.current = markdown;
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentPath) return;
    await saveNote(currentPath, frontmatterRaw + contentRef.current);
    await Promise.all([refreshTree(), refreshIndexes()]);
  }, [currentPath, frontmatterRaw, refreshTree, refreshIndexes]);

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
        saveNote(currentPath, frontmatterRaw + updated);
      }
    },
    [currentPath, frontmatterRaw]
  );

  const handleKanbanChange = useCallback(
    (newMarkdown: string) => {
      contentRef.current = newMarkdown;
      setContent(newMarkdown);
      if (currentPath) {
        saveNote(currentPath, frontmatterRaw + newMarkdown);
      }
    },
    [currentPath, frontmatterRaw]
  );

  const handleCreatePage = useCallback(
    async (title: string, type: string) => {
      if (createTarget === null) return;
      try {
        const result = await createPage(createTarget, title, type);
        setCreateTarget(null);
        await Promise.all([refreshTree(), refreshIndexes()]);
        await openNote(result.path);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to create page");
      }
    },
    [createTarget, refreshTree, refreshIndexes, openNote]
  );

  // Autocomplete handlers
  const handleTriggerLinkAutocomplete = useCallback(
    (pos: { top: number; left: number }) => {
      const items: AutocompleteItem[] = pageIndex.map((p) => ({
        title: p.title,
        path: p.path,
        type: p.type,
        icon: TYPE_ICONS[p.type] || "\u{1F4C4}",
      }));
      setAutocomplete({ mode: "link", position: pos, items });
    },
    [pageIndex]
  );

  const handleTriggerImageAutocomplete = useCallback(
    (pos: { top: number; left: number }) => {
      const items: AutocompleteItem[] = assetIndex.map((a) => ({
        title: a.filename,
        path: a.path,
        type: "image",
        icon: "\u{1F5BC}",
      }));
      setAutocomplete({ mode: "image", position: pos, items });
    },
    [assetIndex]
  );

  const handleAutocompleteSelect = useCallback(
    (item: AutocompleteItem) => {
      if (!currentPath) return;
      const win = window as unknown as Record<string, unknown>;
      const relPath = computeRelativePath(currentPath, item.path);

      if (autocomplete?.mode === "image") {
        const insertImageFn = win.__chronicle_insertImage as
          | ((deleteCount: number, alt: string, src: string) => void)
          | undefined;
        if (!insertImageFn) return;
        // Delete "![" (2 chars) and insert image node
        insertImageFn(2, item.title, relPath);
      } else {
        const insertLinkFn = win.__chronicle_insertLink as
          | ((deleteCount: number, title: string, href: string) => void)
          | undefined;
        if (!insertLinkFn) return;
        // Delete "[" (1 char) and insert link node
        insertLinkFn(1, item.title, relPath);
      }
      setAutocomplete(null);
    },
    [currentPath, autocomplete]
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

    if (noteType === "kanban") {
      return (
        <>
          <div className="editor-toolbar">
            <span className="editor-path">{currentPath}</span>
            <div className="toolbar-actions">
              <span className="type-badge kanban">Kanban</span>
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
            <KanbanView
              content={content}
              onContentChange={handleKanbanChange}
            />
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
            currentPath={currentPath}
            onChange={handleChange}
            onTriggerLinkAutocomplete={handleTriggerLinkAutocomplete}
            onTriggerImageAutocomplete={handleTriggerImageAutocomplete}
            onLinkClick={(href) => {
              if (!currentPath || !href) return;
              // Resolve relative href against current note's directory
              const dir = currentPath.split("/").slice(0, -1);
              for (const seg of href.split("/")) {
                if (seg === "..") dir.pop();
                else if (seg !== "." && seg !== "") dir.push(seg);
              }
              const resolved = dir.join("/");
              openNote(resolved);
            }}
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
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              className={`sidebar-add-btn${searchMode ? " active" : ""}`}
              title="Search (Ctrl+Shift+F)"
              onClick={() => {
                setSearchMode((prev) => !prev);
                setHistoryMode(false);
                setCalendarMode(false);
              }}
            >
              {"\u{1F50D}"}
            </button>
            <button
              className={`sidebar-add-btn${calendarMode ? " active" : ""}`}
              title="Calendar"
              onClick={() => {
                setCalendarMode((prev) => !prev);
                setSearchMode(false);
                setHistoryMode(false);
              }}
            >
              {"\u{1F4C6}"}
            </button>
            <button
              className={`sidebar-add-btn${historyMode ? " active" : ""}`}
              title="Git History"
              onClick={() => {
                setHistoryMode((prev) => !prev);
                setSearchMode(false);
                setCalendarMode(false);
              }}
            >
              {"\u{1F553}"}
            </button>
            <button
              className="sidebar-add-btn"
              title="Git Commit"
              onClick={() => setCommitDialogOpen(true)}
            >
              {"\u{2714}"}
            </button>
            <button
              className="sidebar-add-btn"
              title="New page in root"
              onClick={() => setCreateTarget("")}
            >
              +
            </button>
          </div>
        </div>
        <nav className="sidebar-nav">
          {searchMode ? (
            <SearchPanel
              onOpenNote={openNote}
              onClose={() => setSearchMode(false)}
            />
          ) : calendarMode ? (
            <CalendarView
              onOpenNote={openNote}
              onClose={() => setCalendarMode(false)}
              onCreated={async () => {
                await Promise.all([refreshTree(), refreshIndexes()]);
              }}
            />
          ) : historyMode ? (
            <GitHistoryPanel
              onOpenNote={openNote}
              onClose={() => setHistoryMode(false)}
              onRestored={async () => {
                await Promise.all([refreshTree(), refreshIndexes()]);
                setHistoryMode(false);
              }}
            />
          ) : (
            <TreeView
              tree={tree}
              currentPath={currentPath}
              onSelect={openNote}
              onCreatePage={setCreateTarget}
            />
          )}
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
      {autocomplete && (
        <AutocompletePopup
          items={autocomplete.items}
          position={autocomplete.position}
          onSelect={handleAutocompleteSelect}
          onClose={() => setAutocomplete(null)}
        />
      )}
      {commitDialogOpen && (
        <GitCommitDialog
          onClose={() => setCommitDialogOpen(false)}
          onCommitted={async () => {
            await Promise.all([refreshTree(), refreshIndexes()]);
          }}
        />
      )}
    </div>
  );
}

export default App;
