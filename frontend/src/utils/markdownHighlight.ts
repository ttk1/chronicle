// Shared markdown syntax highlighting utilities
// Used by both MarkdownSourceEditor (textarea overlay) and MarkdownPreview (md code blocks)

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function wrap(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

// Inline token patterns: [regex, css class]
const INLINE_RULES: [RegExp, string][] = [
  [/`[^`]+`/, "md-code-inline"],
  [/!\[[^\]]*\]\([^)]*\)/, "md-image"],
  [/\[[^\]]*\]\([^)]*\)/, "md-link"],
  [/~~.+?~~/, "md-strikethrough"],
  [/(\*\*|__)(.+?)\1/, "md-bold"],
  [/(?<!\*)(\*|_)(?!\1)(.+?)(?<!\1)\1(?!\1)/, "md-italic"],
];

export function highlightInline(text: string): string {
  let result = "";
  let remaining = text;

  while (remaining.length > 0) {
    let best: { index: number; length: number; cls: string } | null = null;

    for (const [re, cls] of INLINE_RULES) {
      const m = remaining.match(re);
      if (m && m.index !== undefined && (!best || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, cls };
      }
    }

    if (best) {
      if (best.index > 0) {
        result += escapeHtml(remaining.slice(0, best.index));
      }
      result += wrap(best.cls, remaining.slice(best.index, best.index + best.length));
      remaining = remaining.slice(best.index + best.length);
    } else {
      result += escapeHtml(remaining);
      remaining = "";
    }
  }

  return result;
}

export function highlightMarkdownLine(line: string): string {
  const headingMatch = line.match(/^(#{1,6}\s)(.*)/);
  if (headingMatch) {
    return (
      wrap("md-heading-marker", headingMatch[1]) +
      `<span class="md-heading">${highlightInline(headingMatch[2])}</span>`
    );
  }
  if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) return wrap("md-hr", line);
  if (/^>\s?/.test(line)) return wrap("md-blockquote", line);
  const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s)(.*)/);
  if (listMatch) {
    return wrap("md-list-marker", listMatch[1]) + highlightInline(listMatch[2]);
  }
  return highlightInline(line);
}

/** Highlight markdown source as HTML (line-by-line, no code fence handling) */
export function highlightMarkdownBlock(code: string): string {
  return code
    .split("\n")
    .map((line) => highlightMarkdownLine(line))
    .join("\n");
}
