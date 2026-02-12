import { useCallback, useRef, useEffect } from "react";
import { uploadAsset } from "../api";
import { computeRelativePath } from "../utils/relativePath";
import "./MarkdownSourceEditor.css";

interface MarkdownSourceEditorProps {
  defaultValue: string;
  currentPath: string;
  onChange?: (markdown: string) => void;
  onTriggerLinkAutocomplete?: (pos: { top: number; left: number }) => void;
  onTriggerImageAutocomplete?: (pos: { top: number; left: number }) => void;
}

export default function MarkdownSourceEditor({
  defaultValue,
  currentPath,
  onChange,
  onTriggerLinkAutocomplete,
  onTriggerImageAutocomplete,
}: MarkdownSourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const triggerLinkRef = useRef(onTriggerLinkAutocomplete);
  triggerLinkRef.current = onTriggerLinkAutocomplete;
  const triggerImageRef = useRef(onTriggerImageAutocomplete);
  triggerImageRef.current = onTriggerImageAutocomplete;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = defaultValue;
    }
  }, [defaultValue]);

  const fireChange = useCallback(() => {
    if (textareaRef.current) {
      onChangeRef.current?.(textareaRef.current.value);
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
      onChangeRef.current?.(ta.value);
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
    <textarea
      ref={textareaRef}
      className="markdown-source-editor"
      defaultValue={defaultValue}
      onInput={fireChange}
      spellCheck={false}
    />
  );
}
