import { useCallback, useMemo, useRef, useState } from "react";
import "./KanbanView.css";

interface KanbanCard {
  text: string;
  checked: boolean;
}

interface KanbanColumn {
  heading: string;
  cards: KanbanCard[];
}

interface ParsedKanban {
  frontmatter: string;
  columns: KanbanColumn[];
}

function parseKanban(markdown: string): ParsedKanban {
  const lines = markdown.split("\n");
  let frontmatter = "";
  const columns: KanbanColumn[] = [];
  let current: KanbanColumn | null = null;
  let frontmatterCount = 0;
  let frontmatterEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      frontmatterCount++;
      if (frontmatterCount === 2) {
        frontmatterEnd = i;
        frontmatter = lines.slice(0, frontmatterEnd + 1).join("\n");
        continue;
      }
      if (frontmatterCount < 2) continue;
    }
    if (frontmatterCount < 2) continue;

    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      current = { heading: headingMatch[1].trim(), cards: [] };
      columns.push(current);
      continue;
    }

    const cardMatch = line.match(/^- \[([ xX])\] (.*)$/);
    if (cardMatch && current) {
      current.cards.push({
        checked: cardMatch[1] !== " ",
        text: cardMatch[2],
      });
    }
  }

  return { frontmatter, columns };
}

function reconstructMarkdown(
  frontmatter: string,
  columns: KanbanColumn[]
): string {
  const parts = [frontmatter, "\n"];

  for (const col of columns) {
    parts.push(`\n## ${col.heading}\n\n`);
    for (const card of col.cards) {
      const check = card.checked ? "x" : " ";
      parts.push(`- [${check}] ${card.text}\n`);
    }
  }

  return parts.join("");
}

interface KanbanViewProps {
  content: string;
  onContentChange: (markdown: string) => void;
}

interface DragSource {
  colIdx: number;
  cardIdx: number;
}

export default function KanbanView({
  content,
  onContentChange,
}: KanbanViewProps) {
  const parsed = useMemo(() => parseKanban(content), [content]);
  const [dropTarget, setDropTarget] = useState<{
    colIdx: number;
    cardIdx: number;
  } | null>(null);
  const dragSourceRef = useRef<DragSource | null>(null);

  const updateColumns = useCallback(
    (newColumns: KanbanColumn[]) => {
      const md = reconstructMarkdown(parsed.frontmatter, newColumns);
      onContentChange(md);
    },
    [parsed.frontmatter, onContentChange]
  );

  const handleToggle = useCallback(
    (colIdx: number, cardIdx: number) => {
      const newColumns = parsed.columns.map((col, ci) => ({
        ...col,
        cards: col.cards.map((card, cdi) => {
          if (ci === colIdx && cdi === cardIdx) {
            return { ...card, checked: !card.checked };
          }
          return card;
        }),
      }));
      updateColumns(newColumns);
    },
    [parsed.columns, updateColumns]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, colIdx: number, cardIdx: number) => {
      dragSourceRef.current = { colIdx, cardIdx };
      e.dataTransfer.effectAllowed = "move";
      // Add dragging class after a tick
      const target = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => target.classList.add("dragging"));
    },
    []
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    dragSourceRef.current = null;
    setDropTarget(null);
    (e.currentTarget as HTMLElement).classList.remove("dragging");
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, colIdx: number, cardIdx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget({ colIdx, cardIdx });
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetColIdx: number, targetCardIdx: number) => {
      e.preventDefault();
      const source = dragSourceRef.current;
      if (!source) return;

      const newColumns = parsed.columns.map((col) => ({
        ...col,
        cards: [...col.cards],
      }));

      // Remove card from source
      const [movedCard] = newColumns[source.colIdx].cards.splice(
        source.cardIdx,
        1
      );

      // Adjust target index if same column and source is before target
      let adjustedIdx = targetCardIdx;
      if (
        source.colIdx === targetColIdx &&
        source.cardIdx < targetCardIdx
      ) {
        adjustedIdx--;
      }

      // Insert at target
      newColumns[targetColIdx].cards.splice(adjustedIdx, 0, movedCard);

      dragSourceRef.current = null;
      setDropTarget(null);
      updateColumns(newColumns);
    },
    [parsed.columns, updateColumns]
  );

  return (
    <div className="kanban-view">
      {parsed.columns.map((col, colIdx) => (
        <div key={colIdx} className="kanban-column">
          <div className="kanban-column-header">
            <span>{col.heading}</span>
            <span className="kanban-column-count">{col.cards.length}</span>
          </div>
          <div
            className="kanban-cards"
            onDragOver={(e) => handleDragOver(e, colIdx, col.cards.length)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, colIdx, col.cards.length)}
          >
            {col.cards.map((card, cardIdx) => (
              <div key={cardIdx}>
                {/* Drop zone before this card */}
                <div
                  className={`kanban-drop-zone${
                    dropTarget?.colIdx === colIdx &&
                    dropTarget?.cardIdx === cardIdx
                      ? " active"
                      : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget({ colIdx, cardIdx });
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDrop(e, colIdx, cardIdx);
                  }}
                />
                <div
                  className={`kanban-card${card.checked ? " checked" : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, colIdx, cardIdx)}
                  onDragEnd={handleDragEnd}
                >
                  <input
                    type="checkbox"
                    checked={card.checked}
                    onChange={() => handleToggle(colIdx, cardIdx)}
                  />
                  <span className="kanban-card-text">{card.text}</span>
                </div>
              </div>
            ))}
            {/* Drop zone at end of column */}
            <div
              className={`kanban-drop-zone${
                dropTarget?.colIdx === colIdx &&
                dropTarget?.cardIdx === col.cards.length
                  ? " active"
                  : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget({ colIdx, cardIdx: col.cards.length });
              }}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.stopPropagation();
                handleDrop(e, colIdx, col.cards.length);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
