import { useCallback, useEffect, useRef, useState } from "react";
import Fuse from "fuse.js";
import "./AutocompletePopup.css";

export interface AutocompleteItem {
  title: string;
  path: string;
  type: string;
  icon: string;
}

interface AutocompletePopupProps {
  items: AutocompleteItem[];
  position: { top: number; left: number };
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
}

export default function AutocompletePopup({
  items,
  position,
  onSelect,
  onClose,
}: AutocompletePopupProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const fuse = useRef(
    new Fuse(items, {
      keys: ["title", "path"],
      threshold: 0.4,
      includeScore: true,
    })
  );

  useEffect(() => {
    fuse.current = new Fuse(items, {
      keys: ["title", "path"],
      threshold: 0.4,
      includeScore: true,
    });
  }, [items]);

  const results = query
    ? fuse.current.search(query).map((r) => r.item)
    : items.slice(0, 20);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, onSelect, onClose]
  );

  return (
    <div
      ref={popupRef}
      className="autocomplete-popup"
      style={{ top: position.top, left: position.left }}
    >
      <div className="autocomplete-input-wrapper">
        <input
          ref={inputRef}
          className="autocomplete-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
        />
      </div>
      <div className="autocomplete-list" ref={listRef}>
        {results.map((item, idx) => (
          <button
            key={item.path}
            className={`autocomplete-item ${idx === selectedIndex ? "selected" : ""}`}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => onSelect(item)}
          >
            <span className="autocomplete-item-icon">{item.icon}</span>
            <div className="autocomplete-item-text">
              <span className="autocomplete-item-title">{item.title}</span>
              <span className="autocomplete-item-path">{item.path}</span>
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <div className="autocomplete-empty">No results</div>
        )}
      </div>
    </div>
  );
}
