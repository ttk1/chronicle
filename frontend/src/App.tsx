import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TreeView from "./components/TreeView";
import TasksView from "./components/TasksView";
import CreatePageDialog from "./components/CreatePageDialog";
import SearchPanel from "./components/SearchPanel";
import GitCommitDialog from "./components/GitCommitDialog";
import GitHistoryPanel from "./components/GitHistoryPanel";
import CalendarView from "./components/CalendarView";
import KanbanView from "./components/KanbanView";
import MarkdownSourceEditor from "./components/MarkdownSourceEditor";
import FileHistoryPanel from "./components/FileHistoryPanel";
import MarkdownPreview from "./components/MarkdownPreview";
import AutocompletePopup, {
  type AutocompleteItem,
} from "./components/AutocompletePopup";
import {
  createPage,
  deleteNote,
  getAssetIndex,
  getNote,
  getPageIndex,
  getTree,
  gitStatus,
  gitWorkingDiff,
  saveNote,
  type AssetItem,
  type PageIndexItem,
  type TreeNode,
} from "./api";
import { computeRelativePath, resolveNotePath } from "./utils/relativePath";
import { TYPE_ICONS } from "./utils/constants";
import "./App.css";

type EditorMode = "view" | "edit";

type SidebarMode = "tree" | "search" | "calendar" | "history";

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

interface DiffResult {
  changed: Set<number>;
  /** Line numbers (1-indexed) after which deletions occurred. 0 = before first line. */
  deletedAfter: Set<number>;
}

/** Parse unified diff text to extract changed/deleted line info in the new file. */
function parseDiffLineNumbers(diffText: string): DiffResult {
  const lines = diffText.split("\n");
  const changed = new Set<number>();
  const deletedAfter = new Set<number>();
  let currentLine = 0;
  let pendingDelete = false;
  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      pendingDelete = false;
      continue;
    }
    if (currentLine === 0) continue;
    if (line.startsWith("+")) {
      changed.add(currentLine);
      pendingDelete = false;
      currentLine++;
    } else if (line.startsWith("-")) {
      pendingDelete = true;
    } else {
      if (pendingDelete) {
        // Deletion happened before this context line
        deletedAfter.add(currentLine - 1);
        pendingDelete = false;
      }
      currentLine++;
    }
  }
  // Handle deletion at end of hunk
  if (pendingDelete) {
    deletedAfter.add(currentLine - 1);
  }
  return { changed, deletedAfter };
}

/**
 * Compute changed/deleted line info using LCS diff.
 * Returns 1-indexed line numbers in `current` that are added or modified,
 * plus positions where deletions occurred.
 */
function computeChangedLines(saved: string, current: string): DiffResult {
  if (saved === current) return { changed: new Set(), deletedAfter: new Set() };
  const a = saved.split("\n");
  const b = current.split("\n");
  const n = a.length;
  const m = b.length;

  let lcsA: Set<number>;
  let lcsB: Set<number>;

  if (n * m > 4_000_000) {
    // Greedy LCS for large files
    const aMap = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const arr = aMap.get(a[i]);
      if (arr) arr.push(i);
      else aMap.set(a[i], [i]);
    }
    lcsA = new Set<number>();
    lcsB = new Set<number>();
    let lastA = -1;
    for (let j = 0; j < m; j++) {
      const positions = aMap.get(b[j]);
      if (!positions) continue;
      for (const pos of positions) {
        if (pos > lastA) {
          lcsA.add(pos);
          lcsB.add(j);
          lastA = pos;
          break;
        }
      }
    }
  } else {
    // Standard LCS DP
    const dp: Uint16Array[] = [];
    for (let i = 0; i <= n; i++) {
      dp.push(new Uint16Array(m + 1));
    }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    lcsA = new Set<number>();
    lcsB = new Set<number>();
    let i = n, j = m;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcsA.add(i - 1);
        lcsB.add(j - 1);
        i--; j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
  }

  // Lines in b not in LCS are changed/added
  const changed = new Set<number>();
  for (let j = 0; j < m; j++) {
    if (!lcsB.has(j)) changed.add(j + 1);
  }

  // Find deletion positions: lines in a not in LCS → map to position in b
  // Walk through a and b together using LCS as anchors
  const deletedAfter = new Set<number>();
  let bPos = 0; // current position in b (0-indexed)
  let delRun = false;
  for (let ai = 0; ai < n; ai++) {
    if (lcsA.has(ai)) {
      // This a-line is matched in LCS, advance bPos to its match
      while (bPos < m && !lcsB.has(bPos)) bPos++;
      if (delRun) {
        // Deletions occurred before this matched line
        deletedAfter.add(bPos); // bPos is 0-indexed, so this = "after line bPos" (before bPos+1)
        delRun = false;
      }
      bPos++;
    } else {
      // This a-line was deleted
      delRun = true;
    }
  }
  if (delRun) {
    // Deletions at the end of the file
    deletedAfter.add(m);
  }

  return { changed, deletedAfter };
}

function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [noteType, setNoteType] = useState<string>("note");
  const [loading, setLoading] = useState(true);
  const [createTarget, setCreateTarget] = useState<string | null>(null);
  const contentRef = useRef(content);

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<{
    mode: "link" | "image";
    position: { top: number; left: number };
    items: AutocompleteItem[];
  } | null>(null);
  const [pageIndex, setPageIndex] = useState<PageIndexItem[]>([]);
  const [assetIndex, setAssetIndex] = useState<AssetItem[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("tree");
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [fileHistoryOpen, setFileHistoryOpen] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [frontmatterRaw, setFrontmatterRaw] = useState<string>("");
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [liveContent, setLiveContent] = useState<string>("");

  // Line change tracking
  const [savedContent, setSavedContent] = useState<string>("");
  const [unsavedLines, setUnsavedLines] = useState<Set<number>>(new Set());
  const [unsavedDeleted, setUnsavedDeleted] = useState<Set<number>>(new Set());
  const [uncommittedLines, setUncommittedLines] = useState<Set<number>>(
    new Set()
  );
  const [uncommittedDeleted, setUncommittedDeleted] = useState<Set<number>>(
    new Set()
  );
  const [uncommittedDiff, setUncommittedDiff] = useState<string>("");
  const unsavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Theme
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("chronicle-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("chronicle-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const toggleSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarMode((prev) => (prev === mode ? "tree" : mode));
  }, []);

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

  const refreshDirtyPaths = useCallback(async () => {
    try {
      const data = await gitStatus();
      setDirtyPaths(new Set(data.files));
    } catch {
      // ignore
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshTree(), refreshIndexes(), refreshDirtyPaths()]);
  }, [refreshTree, refreshIndexes, refreshDirtyPaths]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        toggleSidebarMode("search");
      }
      if (e.ctrlKey && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      }
      if (e.ctrlKey && !e.shiftKey && e.key === "e") {
        e.preventDefault();
        handleToggleEditRef.current();
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [toggleSidebarMode]);

  const fetchUncommittedLines = useCallback(
    async (path: string, frontmatter: string) => {
      try {
        const resp = await gitWorkingDiff(path);
        if (resp.has_changes && resp.diff_text) {
          const diff = parseDiffLineNumbers(resp.diff_text);
          const fmLineCount = frontmatter
            ? frontmatter.split("\n").length - 1
            : 0;
          const adjustedChanged = new Set<number>();
          for (const ln of diff.changed) {
            const adj = ln - fmLineCount;
            if (adj > 0) adjustedChanged.add(adj);
          }
          const adjustedDeleted = new Set<number>();
          for (const ln of diff.deletedAfter) {
            const adj = ln - fmLineCount;
            if (adj >= 0) adjustedDeleted.add(adj);
          }
          setUncommittedLines(adjustedChanged);
          setUncommittedDeleted(adjustedDeleted);
          setUncommittedDiff(resp.diff_text);
        } else {
          setUncommittedLines(new Set());
          setUncommittedDeleted(new Set());
          setUncommittedDiff("");
        }
      } catch {
        setUncommittedLines(new Set());
        setUncommittedDeleted(new Set());
        setUncommittedDiff("");
      }
    },
    []
  );

  const openNote = useCallback(async (path: string) => {
    const note = await getNote(path);
    const { raw, body, meta } = splitFrontmatter(note.content);
    setFrontmatterRaw(raw);
    setContent(body);
    setLiveContent(body);
    contentRef.current = body;
    setSavedContent(body);
    setUnsavedLines(new Set());
    setUnsavedDeleted(new Set());
    setCurrentPath(path);
    setNoteType(typeof meta.type === "string" ? meta.type : "note");
    setEditorMode("view");
    const newHash = "#" + encodeURIComponent(path);
    if (window.location.hash !== newHash) {
      window.history.pushState(null, "", newHash);
    }
    fetchUncommittedLines(path, raw);
  }, [fetchUncommittedLines]);

  const navigateToLink = useCallback(
    (href: string) => {
      if (!currentPath || !href) return;
      if (/^https?:\/\//.test(href)) {
        window.open(href, "_blank");
        return;
      }
      openNote(resolveNotePath(currentPath, href));
    },
    [currentPath, openNote]
  );

  // Load initial page from URL hash and restore on reload
  useEffect(() => {
    refreshAll().then(() => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        openNote(decodeURIComponent(hash)).catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, [refreshAll, openNote]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        openNote(decodeURIComponent(hash)).catch(() => {});
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [openNote]);

  const handleSourceChange = useCallback(
    (markdown: string) => {
      contentRef.current = markdown;
      setLiveContent(markdown);
      // Debounced unsaved line detection
      if (unsavedTimerRef.current) clearTimeout(unsavedTimerRef.current);
      unsavedTimerRef.current = setTimeout(() => {
        const diff = computeChangedLines(savedContent, markdown);
        setUnsavedLines(diff.changed);
        setUnsavedDeleted(diff.deletedAfter);
      }, 300);
    },
    [savedContent]
  );

  const handleToggleEdit = useCallback(() => {
    if (editorMode === "view") {
      const latest = contentRef.current;
      setContent(latest);
      setLiveContent(latest);
      setEditorMode("edit");
    } else {
      setEditorMode("view");
      setLiveContent(contentRef.current);
    }
  }, [editorMode]);

  const handleToggleEditRef = useRef(handleToggleEdit);
  handleToggleEditRef.current = handleToggleEdit;

  const handleSave = useCallback(async () => {
    if (!currentPath) return;
    await saveNote(currentPath, frontmatterRaw + contentRef.current);
    setSavedContent(contentRef.current);
    setUnsavedLines(new Set());
    setUnsavedDeleted(new Set());
    await refreshAll();
    fetchUncommittedLines(currentPath, frontmatterRaw);
  }, [currentPath, frontmatterRaw, refreshAll, fetchUncommittedLines]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const lineStatuses = useMemo(() => {
    const map = new Map<number, "unsaved" | "uncommitted">();
    for (const ln of uncommittedLines) {
      map.set(ln, "uncommitted");
    }
    // unsaved overrides uncommitted
    for (const ln of unsavedLines) {
      map.set(ln, "unsaved");
    }
    return map;
  }, [unsavedLines, uncommittedLines]);

  const deletedLines = useMemo(() => {
    const map = new Map<number, "unsaved" | "uncommitted">();
    for (const ln of uncommittedDeleted) {
      map.set(ln, "uncommitted");
    }
    for (const ln of unsavedDeleted) {
      map.set(ln, "unsaved");
    }
    return map;
  }, [unsavedDeleted, uncommittedDeleted]);

  const handleDelete = useCallback(async () => {
    if (!currentPath) return;
    if (!confirm(`Delete "${currentPath}"?`)) return;
    try {
      await deleteNote(currentPath);
      setCurrentPath(null);
      window.history.pushState(null, "", window.location.pathname);
      await refreshAll();
    } catch {
      alert("Failed to delete");
    }
  }, [currentPath, refreshAll]);

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
        await refreshAll();
        await openNote(result.path);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to create page");
      }
    },
    [createTarget, refreshAll, openNote]
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
      const relPath = computeRelativePath(currentPath, item.path);
      const insertFn = window.__chronicle_source_insertAtCursor;
      if (!insertFn) return;
      if (autocomplete?.mode === "image") {
        insertFn(2, `![${item.title}](${relPath})`);
      } else {
        insertFn(1, `[${item.title}](${relPath})`);
      }
      setAutocomplete(null);
    },
    [currentPath, autocomplete]
  );

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const renderToolbar = (extra?: React.ReactNode) => (
    <div className="editor-toolbar">
      <span className="editor-path">{currentPath}</span>
      <div className="toolbar-actions">
        {extra}
        <button
          className="toolbar-btn"
          onClick={() => setFileHistoryOpen(true)}
          title="File History"
        >
          History
        </button>
        <button className="save-btn" onClick={handleSave}>
          Save
        </button>
        <button
          className="toolbar-btn delete"
          onClick={handleDelete}
          title="Delete this page"
        >
          Delete
        </button>
      </div>
    </div>
  );

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
          {renderToolbar(
            <>
              <span className="type-badge tasks">Tasks</span>
              <button className="toolbar-btn" onClick={() => setNoteType("note")}>
                Edit Raw
              </button>
            </>
          )}
          <div className="editor-wrapper">
            <TasksView content={content} onToggle={handleTaskToggle} />
          </div>
        </>
      );
    }

    if (noteType === "kanban") {
      return (
        <>
          {renderToolbar(
            <>
              <span className="type-badge kanban">Kanban</span>
              <button className="toolbar-btn" onClick={() => setNoteType("note")}>
                Edit Raw
              </button>
            </>
          )}
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
        {renderToolbar(
          <>
            {noteType !== "note" && (
              <span className={`type-badge ${noteType}`}>{noteType}</span>
            )}
            <button
              className={`mode-btn${editorMode === "edit" ? " active" : ""}`}
              onClick={handleToggleEdit}
              title="Ctrl+E"
            >
              {editorMode === "view" ? "Edit" : "View"}
            </button>
          </>
        )}
        {editorMode === "view" ? (
          <div className="editor-wrapper">
            <MarkdownPreview
              content={contentRef.current}
              onLinkClick={navigateToLink}
            />
          </div>
        ) : (
          <div className="editor-wrapper split-layout">
            <div className="split-source">
              <MarkdownSourceEditor
                key={currentPath + ":edit"}
                defaultValue={content}
                currentPath={currentPath}
                lineStatuses={lineStatuses}
                deletedLines={deletedLines}
                savedContent={savedContent}
                uncommittedDiff={uncommittedDiff}
                frontmatterLineCount={
                  frontmatterRaw
                    ? frontmatterRaw.split("\n").length - 1
                    : 0
                }
                onChange={handleSourceChange}
                onTriggerLinkAutocomplete={handleTriggerLinkAutocomplete}
                onTriggerImageAutocomplete={handleTriggerImageAutocomplete}
              />
            </div>
            <div className="split-divider" />
            <div className="split-preview">
              <MarkdownPreview
                content={liveContent}
                onLinkClick={navigateToLink}
              />
            </div>
          </div>
        )}
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
              className="sidebar-add-btn"
              title={theme === "light" ? "Dark mode" : "Light mode"}
              onClick={toggleTheme}
            >
              {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
            </button>
            <button
              className={`sidebar-add-btn${sidebarMode === "search" ? " active" : ""}`}
              title="Search (Ctrl+Shift+F)"
              onClick={() => toggleSidebarMode("search")}
            >
              {"\u{1F50D}"}
            </button>
            <button
              className={`sidebar-add-btn${sidebarMode === "calendar" ? " active" : ""}`}
              title="Calendar"
              onClick={() => toggleSidebarMode("calendar")}
            >
              {"\u{1F4C6}"}
            </button>
            <button
              className={`sidebar-add-btn${sidebarMode === "history" ? " active" : ""}`}
              title="Git History"
              onClick={() => toggleSidebarMode("history")}
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
          {sidebarMode === "search" ? (
            <SearchPanel
              onOpenNote={openNote}
              onClose={() => setSidebarMode("tree")}
            />
          ) : sidebarMode === "calendar" ? (
            <CalendarView
              onOpenNote={openNote}
              onClose={() => setSidebarMode("tree")}
              onCreated={refreshAll}
            />
          ) : sidebarMode === "history" ? (
            <GitHistoryPanel
              onClose={() => setSidebarMode("tree")}
              onRestored={async () => {
                await refreshAll();
                setSidebarMode("tree");
              }}
            />
          ) : (
            <TreeView
              tree={tree}
              currentPath={currentPath}
              dirtyPaths={dirtyPaths}
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
          onCommitted={refreshAll}
        />
      )}
      {fileHistoryOpen && currentPath && (
        <FileHistoryPanel
          filePath={currentPath}
          onClose={() => setFileHistoryOpen(false)}
          onRestored={async () => {
            setFileHistoryOpen(false);
            await refreshAll();
            if (currentPath) {
              await openNote(currentPath);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
