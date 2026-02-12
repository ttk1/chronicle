import React, { useCallback, useMemo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { highlightMarkdownBlock } from "../utils/markdownHighlight";
import "./MarkdownPreview.css";

// Allow className on span/code so highlight.js classes survive sanitization
const highlightSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
};

// Extract raw text from a React element tree (for reading hljs-processed code blocks)
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const p = node.props as { children?: React.ReactNode };
    return extractText(p.children);
  }
  return "";
}

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

  // Custom pre renderer: use our markdown tokenizer for md/markdown code blocks
  const components = useMemo<Components>(
    () => ({
      pre({ children, ...props }) {
        const child = React.Children.toArray(children)[0];
        if (React.isValidElement(child) && child.type === "code") {
          const codeProps = child.props as { className?: string; children?: React.ReactNode };
          const className = codeProps.className || "";
          if (/language-(md|markdown)/.test(className)) {
            const raw = extractText(codeProps.children).replace(/\n$/, "");
            return (
              <pre {...props}>
                <code
                  className={className}
                  dangerouslySetInnerHTML={{
                    __html: highlightMarkdownBlock(raw),
                  }}
                />
              </pre>
            );
          }
        }
        return <pre {...props}>{children}</pre>;
      },
    }),
    []
  );

  return (
    <div className="markdown-preview" onClick={handleClick}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, highlightSchema],
          rehypeHighlight,
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
