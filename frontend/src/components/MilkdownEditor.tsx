import { useCallback, useEffect, useRef } from "react";
import { Editor, defaultValueCtx, rootCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/theme-nord/style.css";
import { uploadAsset } from "../api";
import { computeRelativePath } from "../utils/relativePath";

interface EditorProps {
  defaultValue: string;
  currentPath: string;
  onChange?: (markdown: string) => void;
  onTriggerLinkAutocomplete?: (pos: { top: number; left: number }) => void;
  onTriggerImageAutocomplete?: (pos: { top: number; left: number }) => void;
}

const MilkdownEditorInner: React.FC<EditorProps> = ({
  defaultValue,
  currentPath,
  onChange,
  onTriggerLinkAutocomplete,
  onTriggerImageAutocomplete,
}) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const triggerLinkRef = useRef(onTriggerLinkAutocomplete);
  triggerLinkRef.current = onTriggerLinkAutocomplete;
  const triggerImageRef = useRef(onTriggerImageAutocomplete);
  triggerImageRef.current = onTriggerImageAutocomplete;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const { get } = useEditor((root) => {
    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValue);
        ctx
          .get(listenerCtx)
          .markdownUpdated((_ctx, markdown, _prevMarkdown) => {
            onChangeRef.current?.(markdown);
          });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history);
  }, [defaultValue]);

  // Insert text at current cursor position
  const insertText = useCallback(
    (text: string) => {
      const editor = get();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const tr = state.tr.insertText(text, from);
        view.dispatch(tr);
      });
    },
    [get]
  );

  // Expose insertText on the window for autocomplete callbacks
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__chronicle_insertText = insertText;
    win.__chronicle_currentPath = currentPath;
    return () => {
      delete win.__chronicle_insertText;
      delete win.__chronicle_currentPath;
    };
  }, [insertText, currentPath]);

  // Handle clipboard paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
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
            insertText(`![](${relPath})`);
          } catch (err) {
            console.error("Failed to upload image:", err);
          }
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [insertText]);

  // Handle keydown for autocomplete triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "[") return;

      const editor = get();
      if (!editor) return;

      // Get cursor position for popup placement
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pos = { top: rect.bottom + 4, left: rect.left };

      // Check preceding character to detect ![
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const before = state.doc.textBetween(Math.max(0, from - 1), from);

        if (before === "!") {
          triggerImageRef.current?.(pos);
        } else {
          triggerLinkRef.current?.(pos);
        }
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [get]);

  return <Milkdown />;
};

const MilkdownEditor: React.FC<EditorProps> = (props) => {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
};

export default MilkdownEditor;
