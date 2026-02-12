/**
 * Resolve a relative href against a note's path to get an absolute vault path.
 * e.g. resolveNotePath("projects/alpha/tasks.md", "../beta/notes.md") → "projects/beta/notes.md"
 */
export function resolveNotePath(currentPath: string, href: string): string {
  const dir = currentPath.split("/").slice(0, -1);
  for (const seg of href.split("/")) {
    if (seg === "..") dir.pop();
    else if (seg !== "." && seg !== "") dir.push(seg);
  }
  return dir.join("/");
}

/**
 * Calculate the relative path from `from` to `to`.
 * Both paths should be relative to the vault root (e.g., "projects/alpha/tasks.md").
 */
export function computeRelativePath(from: string, to: string): string {
  const fromParts = from.split("/").slice(0, -1); // directory of current file
  const toParts = to.split("/");

  // Find common prefix length
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  const ups = fromParts.length - common;
  const remaining = toParts.slice(common);

  if (ups === 0) {
    return "./" + remaining.join("/");
  }
  return "../".repeat(ups) + remaining.join("/");
}
