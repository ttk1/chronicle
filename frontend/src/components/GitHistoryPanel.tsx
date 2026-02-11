import { useCallback, useEffect, useState } from "react";
import { gitLog, gitRestore, type CommitInfo } from "../api";
import DiffViewerModal from "./DiffViewerModal";
import "./GitHistoryPanel.css";

interface GitHistoryPanelProps {
  onOpenNote: (path: string) => void;
  onClose: () => void;
  onRestored: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GitHistoryPanel({
  onClose,
  onRestored,
}: GitHistoryPanelProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [diffHash, setDiffHash] = useState<string | null>(null);

  const loadCommits = useCallback(async (p: number, append = false) => {
    setLoading(true);
    try {
      const data = await gitLog(p, 30);
      setCommits((prev) => (append ? [...prev, ...data.commits] : data.commits));
      setTotal(data.total);
      setPage(p);
    } catch {
      // empty repo or error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommits(1);
  }, [loadCommits]);

  const handleRestore = async (hash: string) => {
    if (!confirm(`Restore vault to commit ${hash.slice(0, 7)}? This will create a new commit.`)) {
      return;
    }
    try {
      await gitRestore(hash);
      onRestored();
      loadCommits(1);
    } catch {
      alert("Restore failed");
    }
  };

  const hasMore = commits.length < total;

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">History</span>
        <button className="history-close-btn" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      {loading && commits.length === 0 && (
        <div className="history-loading">Loading...</div>
      )}
      {!loading && commits.length === 0 && (
        <div className="history-empty">No commits yet</div>
      )}
      <div className="history-list">
        {commits.map((c) => (
          <div key={c.hash} className="history-commit">
            <div className="history-commit-top">
              <span className="history-hash">{c.short_hash}</span>
              <span className="history-date">{formatDate(c.date)}</span>
            </div>
            <div className="history-message">{c.message}</div>
            <div className="history-actions">
              <button
                className="history-action-btn"
                onClick={() => setDiffHash(c.hash)}
              >
                Diff
              </button>
              <button
                className="history-action-btn restore"
                onClick={() => handleRestore(c.hash)}
              >
                Restore
              </button>
            </div>
          </div>
        ))}
        {hasMore && (
          <div className="history-load-more">
            <button
              onClick={() => loadCommits(page + 1, true)}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
      {diffHash && (
        <DiffViewerModal
          commitHash={diffHash}
          onClose={() => setDiffHash(null)}
        />
      )}
    </div>
  );
}
