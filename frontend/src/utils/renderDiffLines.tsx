import "./renderDiffLines.css";

export function renderDiffLines(text: string) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    let cls = "diff-line";
    if (line.startsWith("+")) cls += " add";
    else if (line.startsWith("-")) cls += " del";
    else if (line.startsWith("@@")) cls += " hunk";
    return (
      <div key={i} className={cls}>
        {line}
      </div>
    );
  });
}
