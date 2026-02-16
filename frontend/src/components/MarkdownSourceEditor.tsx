import { type ReactNode, useCallback, useRef, useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import csharp from "highlight.js/lib/languages/csharp";
import cpp from "highlight.js/lib/languages/cpp";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import { uploadAsset } from "../api";
import { computeRelativePath } from "../utils/relativePath";
import { renderDiffLines } from "../utils/renderDiffLines";
import {
  escapeHtml,
  wrap,
  highlightMarkdownLine,
  highlightMarkdownBlock,
} from "../utils/markdownHighlight";
import "./MarkdownSourceEditor.css";

// Register highlight.js languages with aliases
const LANGUAGES: [string, typeof javascript][] = [
  ["javascript", javascript], ["js", javascript],
  ["typescript", typescript], ["ts", typescript],
  ["python", python], ["py", python],
  ["bash", bash], ["sh", bash],
  ["json", json],
  ["css", css],
  ["html", xml], ["xml", xml],
  ["markdown", markdown], ["md", markdown],
  ["yaml", yaml], ["yml", yaml],
  ["sql", sql],
  ["go", go],
  ["rust", rust], ["rs", rust],
  ["java", java],
  ["csharp", csharp], ["cs", csharp],
  ["cpp", cpp], ["c", cpp],
  ["dockerfile", dockerfile], ["docker", dockerfile],
];
for (const [name, lang] of LANGUAGES) {
  hljs.registerLanguage(name, lang);
}

type LineStatus = "unsaved" | "uncommitted";

interface DiffPopupState {
  top: number;
  left: number;
  lines: string;
}

/**
 * Extract the unified diff hunk containing the given body line number.
 * `fmLineCount` is the number of frontmatter lines to offset.
 */
function extractHunkForLine(
  diffText: string,
  bodyLine: number,
  fmLineCount: number
): string | null {
  const fileLine = bodyLine + fmLineCount;
  const rawLines = diffText.split("\n");
  type Hunk = { startNew: number; countNew: number; lines: string[] };
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const line of rawLines) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      if (current) hunks.push(current);
      current = {
        startNew: parseInt(m[1], 10),
        countNew: m[2] ? parseInt(m[2], 10) : 1,
        lines: [line],
      };
      continue;
    }
    if (current && !line.startsWith("diff ") && !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index ")) {
      current.lines.push(line);
    }
  }
  if (current) hunks.push(current);

  // Find hunk that covers fileLine (with tolerance for delete markers)
  for (const h of hunks) {
    const end = h.startNew + Math.max(h.countNew, 1) - 1;
    if (fileLine >= h.startNew - 1 && fileLine <= end + 1) {
      return h.lines.join("\n");
    }
  }
  return null;
}

/**
 * Compute an edit script (sequence of equal/insert/delete operations)
 * between arrays a and b using LCS DP.
 */
type EditOp =
  | { type: "equal"; aIdx: number; bIdx: number }
  | { type: "insert"; bIdx: number }
  | { type: "delete"; aIdx: number };

function computeEditScript(a: string[], b: string[]): EditOp[] {
  const n = a.length;
  const m = b.length;

  // DP for LCS
  const dp: Uint16Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build edit script
  const ops: EditOp[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "equal", aIdx: i - 1, bIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "insert", bIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: "delete", aIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

/**
 * Build a diff hunk around `bodyLine` (1-indexed in b) for unsaved changes.
 * Uses LCS to produce a correct edit script, then extracts the hunk
 * containing the target line with context.
 */
function buildUnsavedDiff(
  savedContent: string,
  currentContent: string,
  bodyLine: number,
  isDeletion: boolean
): string | null {
  const a = savedContent.split("\n");
  const b = currentContent.split("\n");
  const ops = computeEditScript(a, b);

  // Group consecutive non-equal ops into hunks, with context
  type Hunk = { ops: EditOp[]; bStart: number; bEnd: number };
  const hunks: Hunk[] = [];
  let currentHunk: EditOp[] = [];
  let hunkBStart = -1;
  let hunkBEnd = -1;
  let contextAfter = 0;

  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi];
    if (op.type === "equal") {
      if (currentHunk.length > 0) {
        contextAfter++;
        currentHunk.push(op);
        hunkBEnd = op.bIdx;
        if (contextAfter >= 3) {
          // End hunk
          hunks.push({ ops: currentHunk, bStart: hunkBStart, bEnd: hunkBEnd });
          currentHunk = [];
          hunkBStart = -1;
          hunkBEnd = -1;
          contextAfter = 0;
        }
      }
    } else {
      // Start or extend hunk with up to 3 context lines before
      if (currentHunk.length === 0) {
        const ctxStart = Math.max(0, oi - 3);
        for (let ci = ctxStart; ci < oi; ci++) {
          const cop = ops[ci];
          if (cop.type === "equal") {
            currentHunk.push(cop);
            if (hunkBStart < 0) hunkBStart = cop.bIdx;
            hunkBEnd = cop.bIdx;
          }
        }
      }
      contextAfter = 0;
      currentHunk.push(op);
      if (op.type === "insert") {
        if (hunkBStart < 0) hunkBStart = op.bIdx;
        hunkBEnd = op.bIdx;
      } else if (hunkBStart < 0) {
        // delete-only: associate with the nearest b position
        for (let ni = oi + 1; ni < ops.length; ni++) {
          const nop = ops[ni];
          if (nop.type === "equal" || nop.type === "insert") {
            hunkBStart = nop.bIdx;
            hunkBEnd = hunkBStart;
            break;
          }
        }
        if (hunkBStart < 0) {
          hunkBStart = b.length;
          hunkBEnd = b.length;
        }
      }
    }
  }
  if (currentHunk.length > 0 && currentHunk.some(o => o.type !== "equal")) {
    hunks.push({ ops: currentHunk, bStart: hunkBStart, bEnd: hunkBEnd });
  }

  // Find the hunk that contains bodyLine (1-indexed)
  const targetBIdx = bodyLine - 1;
  let matchedHunk: Hunk | null = null;
  for (const h of hunks) {
    if (isDeletion) {
      // For deletion markers, match hunks that have deletes near this position
      if (targetBIdx >= h.bStart - 1 && targetBIdx <= h.bEnd + 1) {
        matchedHunk = h;
        break;
      }
    } else {
      if (targetBIdx >= h.bStart && targetBIdx <= h.bEnd) {
        matchedHunk = h;
        break;
      }
    }
  }
  if (!matchedHunk) return null;

  // Render hunk as diff lines
  const lines: string[] = [];
  for (const op of matchedHunk.ops) {
    if (op.type === "equal") lines.push(" " + b[op.bIdx]);
    else if (op.type === "delete") lines.push("-" + a[op.aIdx]);
    else if (op.type === "insert") lines.push("+" + b[op.bIdx]);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

interface MarkdownSourceEditorProps {
  defaultValue: string;
  currentPath: string;
  lineStatuses?: Map<number, LineStatus>;
  /** Lines after which deletions occurred. Key = line number (0 = before first line). */
  deletedLines?: Map<number, LineStatus>;
  savedContent?: string;
  uncommittedDiff?: string;
  frontmatterLineCount?: number;
  onChange?: (markdown: string) => void;
  onTriggerLinkAutocomplete?: (pos: { top: number; left: number }) => void;
  onTriggerImageAutocomplete?: (pos: { top: number; left: number }) => void;
}

function highlightCode(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
  } catch {
    // fall through
  }
  return escapeHtml(code);
}

function flushCodeBlock(
  codeLines: string[],
  codeLang: string,
  htmlLines: string[]
) {
  if (/^(md|markdown)$/i.test(codeLang)) {
    htmlLines.push(highlightMarkdownBlock(codeLines.join("\n")));
  } else {
    const highlighted = highlightCode(codeLines.join("\n"), codeLang);
    htmlLines.push(highlighted);
  }
}

function highlightMarkdown(source: string): string {
  const lines = source.split("\n");
  const htmlLines: string[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Frontmatter detection (--- at start of file)
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      htmlLines.push(wrap("md-frontmatter", line));
      continue;
    }
    if (inFrontmatter && !frontmatterDone) {
      htmlLines.push(wrap("md-frontmatter", line));
      if (line.trim() === "---") {
        inFrontmatter = false;
        frontmatterDone = true;
      }
      continue;
    }

    // Code fence open
    if (!inCodeBlock && /^```/.test(line)) {
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      htmlLines.push(wrap("md-code-fence", line));
      continue;
    }

    // Code fence close
    if (inCodeBlock && /^```\s*$/.test(line)) {
      inCodeBlock = false;
      flushCodeBlock(codeLines, codeLang, htmlLines);
      htmlLines.push(wrap("md-code-fence", line));
      codeLines = [];
      codeLang = "";
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Normal markdown line (heading, hr, blockquote, list, inline)
    htmlLines.push(highlightMarkdownLine(line));
  }

  // Handle unclosed code block (still typing)
  if (inCodeBlock && codeLines.length > 0) {
    flushCodeBlock(codeLines, codeLang, htmlLines);
  }

  return htmlLines.join("\n");
}

// ---- Component ----

export default function MarkdownSourceEditor({
  defaultValue,
  currentPath,
  lineStatuses,
  deletedLines,
  savedContent,
  uncommittedDiff,
  frontmatterLineCount = 0,
  onChange,
  onTriggerLinkAutocomplete,
  onTriggerImageAutocomplete,
}: MarkdownSourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [diffPopup, setDiffPopup] = useState<DiffPopupState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const triggerLinkRef = useRef(onTriggerLinkAutocomplete);
  triggerLinkRef.current = onTriggerLinkAutocomplete;
  const triggerImageRef = useRef(onTriggerImageAutocomplete);
  triggerImageRef.current = onTriggerImageAutocomplete;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const [highlightHtml, setHighlightHtml] = useState(() =>
    highlightMarkdown(defaultValue)
  );
  const [lineCount, setLineCount] = useState(
    () => defaultValue.split("\n").length
  );

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = defaultValue;
    }
    setHighlightHtml(highlightMarkdown(defaultValue));
    setLineCount(defaultValue.split("\n").length);
  }, [defaultValue]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = highlightRef.current;
    const gutter = gutterRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (ta && gutter) {
      gutter.scrollTop = ta.scrollTop;
    }
    setDiffPopup(null); // close popup on scroll
  }, []);

  const fireChange = useCallback(() => {
    if (textareaRef.current) {
      const value = textareaRef.current.value;
      onChangeRef.current?.(value);
      setHighlightHtml(highlightMarkdown(value));
      setLineCount(value.split("\n").length);
    }
  }, []);

  // Insert text at textarea cursor, replacing `deleteCount` chars before cursor
  const insertAtCursor = useCallback(
    (deleteCount: number, text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart - deleteCount;
      const end = ta.selectionEnd;
      ta.setRangeText(text, start, end, "end");
      const value = ta.value;
      onChangeRef.current?.(value);
      setHighlightHtml(highlightMarkdown(value));
    },
    []
  );

  // Expose insertAtCursor on window for autocomplete select
  useEffect(() => {
    window.__chronicle_source_insertAtCursor = insertAtCursor;
    return () => {
      delete window.__chronicle_source_insertAtCursor;
    };
  }, [insertAtCursor]);

  // Handle [ keyup for autocomplete triggers
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "[") return;
      const ta = textareaRef.current;
      if (!ta || document.activeElement !== ta) return;

      // Get caret pixel position for popup placement
      const rect = ta.getBoundingClientRect();
      const pos = { top: rect.top + 24, left: rect.left + 24 };

      const cursor = ta.selectionStart;
      const before = ta.value.charAt(cursor - 2);

      if (before === "!") {
        triggerImageRef.current?.(pos);
      } else {
        triggerLinkRef.current?.(pos);
      }
    };

    document.addEventListener("keyup", handleKeyUp);
    return () => document.removeEventListener("keyup", handleKeyUp);
  }, []);

  // Handle clipboard paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const ta = textareaRef.current;
      if (!ta || document.activeElement !== ta) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;

          try {
            const result = await uploadAsset(blob);
            const relPath = computeRelativePath(
              currentPathRef.current,
              result.path
            );
            insertAtCursor(0, `![](${relPath})`);
          } catch (err) {
            console.error("Failed to upload image:", err);
          }
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [insertAtCursor]);

  // Close popup on Escape or outside click
  useEffect(() => {
    if (!diffPopup) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDiffPopup(null);
    };
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setDiffPopup(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick, true);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick, true);
    };
  }, [diffPopup]);

  const handleGutterClick = useCallback(
    (lineNum: number, status: LineStatus, isDeletion: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const wrapperRect = textareaRef.current?.parentElement?.getBoundingClientRect();
      const left = (wrapperRect?.left || 0) + 8;
      const top = rect.top;

      const currentText = textareaRef.current?.value || "";
      let hunkText: string | null = null;

      if (status === "uncommitted" && uncommittedDiff) {
        // Use the git unified diff for uncommitted changes
        hunkText = extractHunkForLine(uncommittedDiff, lineNum, frontmatterLineCount);
      } else if (status === "unsaved" && savedContent !== undefined) {
        // Compute diff from saved vs current using LCS
        hunkText = buildUnsavedDiff(savedContent, currentText, lineNum, isDeletion);
      }

      if (hunkText) {
        setDiffPopup({ top, left, lines: hunkText });
      }
    },
    [savedContent, uncommittedDiff, frontmatterLineCount]
  );

  const hasGutter = (lineStatuses && lineStatuses.size > 0) ||
    (deletedLines && deletedLines.size > 0);

  const gutterLines = useMemo(() => {
    if (!hasGutter) return null;
    const items: ReactNode[] = [];
    // Check for deletion before first line (key=0)
    const delBefore = deletedLines?.get(0);
    if (delBefore) {
      items.push(
        <div
          key="del-0"
          className="gutter-deleted gutter-clickable"
          onMouseDown={(e) => handleGutterClick(0, delBefore, true, e)}
        />
      );
    }
    for (let i = 1; i <= lineCount; i++) {
      const status = lineStatuses?.get(i);
      items.push(
        <div
          key={i}
          className={
            "gutter-line" + (status ? ` gutter-${status} gutter-clickable` : "")
          }
          {...(status
            ? { onMouseDown: (e: React.MouseEvent) => handleGutterClick(i, status, false, e) }
            : {})}
        />
      );
      // Check for deletion after this line
      const delAfter = deletedLines?.get(i);
      if (delAfter) {
        items.push(
          <div
            key={`del-${i}`}
            className="gutter-deleted gutter-clickable"
            onMouseDown={(e) => handleGutterClick(i, delAfter, true, e)}
          />
        );
      }
    }
    return items;
  }, [lineStatuses, deletedLines, lineCount, hasGutter, handleGutterClick]);

  return (
    <div className="source-editor-wrapper">
      {gutterLines && (
        <div
          ref={gutterRef}
          className="source-gutter-layer"
          aria-hidden="true"
        >
          {gutterLines}
        </div>
      )}
      <pre
        ref={highlightRef}
        className="source-highlight-layer"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlightHtml + "\n" }}
      />
      <textarea
        ref={textareaRef}
        className="markdown-source-editor"
        defaultValue={defaultValue}
        onInput={fireChange}
        onScroll={syncScroll}
        spellCheck={false}
      />
      {diffPopup && (
        <div
          ref={popupRef}
          className="gutter-diff-popup"
          style={{ top: diffPopup.top, left: diffPopup.left }}
        >
          <div className="gutter-diff-popup-header">
            <span>Changes</span>
            <button
              className="gutter-diff-popup-close"
              onClick={() => setDiffPopup(null)}
            >
              &times;
            </button>
          </div>
          <div className="gutter-diff-popup-content">
            {renderDiffLines(diffPopup.lines)}
          </div>
        </div>
      )}
    </div>
  );
}
