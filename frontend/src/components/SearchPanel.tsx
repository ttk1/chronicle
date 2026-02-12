import { useEffect, useRef, useState } from "react";
import { searchNotes, type SearchResultItem } from "../api";
import { TYPE_ICONS } from "../utils/constants";
import "./SearchPanel.css";

function renderContext(context: string): React.ReactNode {
  const parts = context.split(/\*\*(.*?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="search-highlight">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface SearchPanelProps {
  onOpenNote: (path: string) => void;
  onClose: () => void;
}

export default function SearchPanel({ onOpenNote, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchNotes({
          q: query,
          regex,
          caseSensitive,
        });
        setResults(data.results);
        setTotal(data.total);
        setExpandedFiles(new Set(data.results.map((r) => r.path)));
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, regex, caseSensitive]);

  const toggleExpand = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="search-panel">
      <div className="search-header">
        <span className="search-title">Search</span>
        <button className="search-close-btn" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      <div className="search-input-area">
        <div className="search-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search in notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="search-options">
            <button
              className={caseSensitive ? "active" : ""}
              onClick={() => setCaseSensitive((v) => !v)}
              title="Match Case"
            >
              Aa
            </button>
            <button
              className={regex ? "active" : ""}
              onClick={() => setRegex((v) => !v)}
              title="Use Regular Expression"
            >
              .*
            </button>
          </div>
        </div>
      </div>
      {loading && <div className="search-loading">Searching...</div>}
      {!loading && query.trim() && (
        <div className="search-summary">
          {total} file{total !== 1 ? "s" : ""} found
        </div>
      )}
      <div className="search-results">
        {results.map((result) => (
          <div key={result.path} className="search-result-file">
            <button
              className="search-file-header"
              onClick={() => toggleExpand(result.path)}
            >
              <span className="search-file-icon">
                {TYPE_ICONS[result.type] || "\u{1F4C4}"}
              </span>
              <span className="search-file-title">{result.title}</span>
              <span className="search-match-count">
                {result.matches.length}
              </span>
            </button>
            <div
              className="search-file-path"
              style={{ cursor: "pointer" }}
              onClick={() => onOpenNote(result.path)}
            >
              {result.path}
            </div>
            {expandedFiles.has(result.path) && (
              <div className="search-matches">
                {result.matches.map((match, idx) => (
                  <button
                    key={idx}
                    className="search-match-line"
                    onClick={() => onOpenNote(result.path)}
                  >
                    <span className="search-line-number">L{match.line}</span>
                    <span className="search-line-context">
                      {renderContext(match.context)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
