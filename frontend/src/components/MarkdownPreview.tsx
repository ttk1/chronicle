import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import "./MarkdownPreview.css";

interface MarkdownPreviewProps {
  content: string;
  currentPath?: string;
  onOpenNote?: (path: string) => void;
}

export default function MarkdownPreview({
  content,
  currentPath,
  onOpenNote,
}: MarkdownPreviewProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !currentPath || !onOpenNote) return;
      // Only handle relative links (not http/https)
      if (/^https?:\/\//.test(href)) return;
      e.preventDefault();
      // Resolve relative href against current note's directory
      const dir = currentPath.split("/").slice(0, -1);
      for (const seg of href.split("/")) {
        if (seg === "..") dir.pop();
        else if (seg !== "." && seg !== "") dir.push(seg);
      }
      onOpenNote(dir.join("/"));
    },
    [currentPath, onOpenNote]
  );

  return (
    <div className="markdown-preview" onClick={handleClick}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
