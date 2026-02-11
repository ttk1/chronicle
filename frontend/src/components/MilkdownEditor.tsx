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
  onLinkClick?: (href: string) => void;
}

const MilkdownEditorInner: React.FC<EditorProps> = ({
  defaultValue,
  currentPath,
  onChange,
  onTriggerLinkAutocomplete,
  onTriggerImageAutocomplete,
  onLinkClick,
}) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const triggerLinkRef = useRef(onTriggerLinkAutocomplete);
  triggerLinkRef.current = onTriggerLinkAutocomplete;
  const triggerImageRef = useRef(onTriggerImageAutocomplete);
  triggerImageRef.current = onTriggerImageAutocomplete;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;

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

  // Insert a link node (ProseMirror mark) replacing N chars before cursor
  const insertLink = useCallback(
    (deleteCount: number, title: string, href: string) => {
      const editor = get();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const start = Math.max(0, from - deleteCount);
        const linkMark = state.schema.marks.link.create({ href });
        const textNode = state.schema.text(title, [linkMark]);
        const tr = state.tr.replaceWith(start, from, textNode);
        view.dispatch(tr);
      });
    },
    [get]
  );

  // Insert an image node replacing N chars before cursor
  const insertImage = useCallback(
    (deleteCount: number, alt: string, src: string) => {
      const editor = get();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const start = Math.max(0, from - deleteCount);
        const imageNode = state.schema.nodes.image.create({ src, alt });
        const tr = state.tr.replaceWith(start, from, imageNode);
        view.dispatch(tr);
      });
    },
    [get]
  );

  // Expose editor helpers on the window for autocomplete callbacks
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__chronicle_insertLink = insertLink;
    win.__chronicle_insertImage = insertImage;
    return () => {
      delete win.__chronicle_insertLink;
      delete win.__chronicle_insertImage;
    };
  }, [insertLink, insertImage]);

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
            insertImage(0, "", relPath);
          } catch (err) {
            console.error("Failed to upload image:", err);
          }
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [insertImage]);

  // Handle Ctrl+Click on links to navigate
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      onLinkClickRef.current?.(href);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Handle keyup for autocomplete triggers (after [ is inserted into editor)
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "[") return;

      const editor = get();
      if (!editor) return;

      // Get cursor position for popup placement
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pos = { top: rect.bottom + 4, left: rect.left };

      // Check characters before cursor to detect ![ (now [ is already in doc)
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(Math.max(0, from - 2), from);

        if (textBefore === "![") {
          triggerImageRef.current?.(pos);
        } else {
          triggerLinkRef.current?.(pos);
        }
      });
    };

    document.addEventListener("keyup", handleKeyUp);
    return () => document.removeEventListener("keyup", handleKeyUp);
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
