import { useCallback, useEffect, useState } from "react";
import {
  gitDiff,
  gitFileLog,
  gitRestoreFile,
  gitWorkingDiff,
  type CommitInfo,
  type DiffResponse,
  type WorkingDiffResponse,
} from "../api";
import { formatDate } from "../utils/constants";
import { renderDiffLines } from "../utils/renderDiffLines";
import "./FileHistoryPanel.css";

interface FileHistoryPanelProps {
  filePath: string;
  onClose: () => void;
  onRestored: () => void;
}

export default function FileHistoryPanel({
  filePath,
  onClose,
  onRestored,
}: FileHistoryPanelProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [workingDiff, setWorkingDiff] = useState<WorkingDiffResponse | null>(null);
  const [showWorkingDiff, setShowWorkingDiff] = useState(false);

  const loadCommits = useCallback(
    async (p: number, append = false) => {
      setLoading(true);
      try {
        const data = await gitFileLog(filePath, p, 30);
        setCommits((prev) => (append ? [...prev, ...data.commits] : data.commits));
        setTotal(data.total);
        setPage(p);
      } catch {
        // empty history
      } finally {
        setLoading(false);
      }
    },
    [filePath]
  );

  useEffect(() => {
    loadCommits(1);
  }, [loadCommits]);

  const handleShowDiff = async (hash: string) => {
    try {
      const data = await gitDiff(hash);
      // Filter to only show the current file
      setDiffData({
        ...data,
        files: data.files.filter((f) => f.path === filePath),
      });
    } catch {
      alert("Failed to load diff");
    }
  };

  const handleShowWorkingDiff = async () => {
    try {
      const data = await gitWorkingDiff(filePath);
      setWorkingDiff(data);
      setShowWorkingDiff(true);
    } catch {
      alert("Failed to load working diff");
    }
  };

  const handleRestore = async (hash: string) => {
    if (
      !confirm(
        `Restore ${filePath} to commit ${hash.slice(0, 7)}? This will create a new commit.`
      )
    ) {
      return;
    }
    try {
      await gitRestoreFile(hash, filePath);
      await loadCommits(1);
      onRestored();
    } catch {
      alert("Restore failed");
    }
  };

  const hasMore = commits.length < total;

  return (
    <div className="file-history-overlay" onClick={onClose}>
      <div className="file-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-history-header">
          <div className="file-history-header-info">
            <span className="file-history-title">File History</span>
            <span className="file-history-path">{filePath}</span>
          </div>
          <button
            className="file-history-close-btn"
            onClick={onClose}
            title="Close"
          >
            &times;
          </button>
        </div>

        <div className="file-history-actions-bar">
          <button
            className="file-history-working-diff-btn"
            onClick={handleShowWorkingDiff}
          >
            Working Diff
          </button>
        </div>

        {showWorkingDiff && workingDiff && (
          <div className="file-history-working-diff">
            <div className="file-history-working-diff-header">
              <span>Uncommitted changes</span>
              <button
                className="file-history-working-diff-close"
                onClick={() => setShowWorkingDiff(false)}
              >
                &times;
              </button>
            </div>
            {workingDiff.has_changes ? (
              <div className="file-history-working-diff-content">
                {renderDiffLines(workingDiff.diff_text)}
              </div>
            ) : (
              <div className="file-history-no-changes">
                No uncommitted changes
              </div>
            )}
          </div>
        )}

        {loading && commits.length === 0 && (
          <div className="file-history-loading">Loading...</div>
        )}
        {!loading && commits.length === 0 && (
          <div className="file-history-empty">No commits for this file</div>
        )}

        <div className="file-history-list">
          {commits.map((c) => (
            <div key={c.hash} className="file-history-commit">
              <div className="file-history-commit-top">
                <span className="file-history-hash">{c.short_hash}</span>
                <span className="file-history-date">{formatDate(c.date)}</span>
              </div>
              <div className="file-history-message">{c.message}</div>
              <div className="file-history-commit-actions">
                <button
                  className="file-history-action-btn"
                  onClick={() => handleShowDiff(c.hash)}
                >
                  Diff
                </button>
                <button
                  className="file-history-action-btn restore"
                  onClick={() => handleRestore(c.hash)}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="file-history-load-more">
              <button
                onClick={() => loadCommits(page + 1, true)}
                disabled={loading}
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>

        {/* Commit diff viewer (inline) */}
        {diffData && (
          <div className="file-history-working-diff">
            <div className="file-history-working-diff-header">
              <span>
                {diffData.hash.slice(0, 7)} — {diffData.message}
              </span>
              <button
                className="file-history-working-diff-close"
                onClick={() => setDiffData(null)}
              >
                &times;
              </button>
            </div>
            {diffData.files.length === 0 ? (
              <div className="file-history-no-changes">
                File not changed in this commit
              </div>
            ) : (
              <div className="file-history-working-diff-content">
                {diffData.files.map((f, i) => (
                  <div key={i}>{renderDiffLines(f.diff_text)}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
