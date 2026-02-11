import { useRef } from "react";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/theme-nord/style.css";

interface EditorProps {
  defaultValue: string;
  onChange?: (markdown: string) => void;
}

const MilkdownEditorInner: React.FC<EditorProps> = ({
  defaultValue,
  onChange,
}) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) => {
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
