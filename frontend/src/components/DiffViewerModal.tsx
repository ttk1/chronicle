import { useEffect, useState } from "react";
import { gitDiff, type DiffResponse } from "../api";
import "./DiffViewerModal.css";

interface DiffViewerModalProps {
  commitHash: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderDiffLines(text: string) {
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

export default function DiffViewerModal({
  commitHash,
  onClose,
}: DiffViewerModalProps) {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gitDiff(commitHash)
      .then(setDiff)
      .finally(() => setLoading(false));
  }, [commitHash]);

  return (
    <div className="diff-overlay" onClick={onClose}>
      <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="diff-loading">Loading diff...</div>
        ) : diff ? (
          <>
            <div className="diff-header">
              <div className="diff-header-info">
                <div className="diff-header-top">
                  <span className="diff-header-hash">
                    {diff.hash.slice(0, 7)}
                  </span>
                  <span className="diff-header-date">
                    {formatDate(diff.date)}
                  </span>
                </div>
                <div className="diff-header-message">{diff.message}</div>
              </div>
              <button
                className="diff-close-btn"
                onClick={onClose}
                title="Close"
              >
                &times;
              </button>
            </div>
            <div className="diff-body">
              {diff.files.length === 0 && (
                <div className="diff-loading">No changes in this commit</div>
              )}
              {diff.files.map((f, i) => (
                <div key={i} className="diff-file">
                  <div className="diff-file-header">
                    <span
                      className={`diff-change-badge ${f.change_type}`}
                    >
                      {f.change_type}
                    </span>
                    <span className="diff-file-path">{f.path}</span>
                  </div>
                  <div className="diff-content">
                    {renderDiffLines(f.diff_text)}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="diff-loading">Failed to load diff</div>
        )}
      </div>
    </div>
  );
}
