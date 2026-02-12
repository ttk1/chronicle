import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import "./MarkdownPreview.css";

interface MarkdownPreviewProps {
  content: string;
  onLinkClick?: (href: string) => void;
}

export default function MarkdownPreview({
  content,
  onLinkClick,
}: MarkdownPreviewProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !onLinkClick) return;
      e.preventDefault();
      onLinkClick(href);
    },
    [onLinkClick]
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
