import { useCallback, useRef, useEffect, useState } from "react";
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

interface MarkdownSourceEditorProps {
  defaultValue: string;
  currentPath: string;
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
  onChange,
  onTriggerLinkAutocomplete,
  onTriggerImageAutocomplete,
}: MarkdownSourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = defaultValue;
    }
    setHighlightHtml(highlightMarkdown(defaultValue));
  }, [defaultValue]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = highlightRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const fireChange = useCallback(() => {
    if (textareaRef.current) {
      const value = textareaRef.current.value;
      onChangeRef.current?.(value);
      setHighlightHtml(highlightMarkdown(value));
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

  return (
    <div className="source-editor-wrapper">
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
    </div>
  );
}
