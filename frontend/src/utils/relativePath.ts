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
