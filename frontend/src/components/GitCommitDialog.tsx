import { useEffect, useState } from "react";
import { gitCommit, gitStatus } from "../api";
import "./CreatePageDialog.css";
import "./GitCommitDialog.css";

interface GitCommitDialogProps {
  onClose: () => void;
  onCommitted: () => void;
}

export default function GitCommitDialog({
  onClose,
  onCommitted,
}: GitCommitDialogProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "committing" | "success" | "error"
  >("idle");
  const [result, setResult] = useState("");
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(true);

  useEffect(() => {
    gitStatus()
      .then((data) => {
        setChangedFiles(data.files);
        setSelectedFiles(new Set(data.files));
      })
      .catch(() => {})
      .finally(() => setLoadingFiles(false));
  }, []);

  const toggleFile = (file: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFiles.size === changedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(changedFiles));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || selectedFiles.size === 0) return;
    setStatus("committing");
    try {
      const files =
        selectedFiles.size === changedFiles.length
          ? undefined
          : Array.from(selectedFiles);
      const info = await gitCommit(message.trim(), files);
      setStatus("success");
      setResult(`${info.short_hash} ${info.message}`);
      onCommitted();
    } catch {
      setStatus("error");
      setResult("Commit failed");
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog commit-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="dialog-title">Git Commit</h3>

        {status === "success" ? (
          <>
            <p className="commit-result success">Committed: {result}</p>
            <div className="dialog-actions">
              <button className="dialog-btn primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : status === "error" ? (
          <>
            <p className="commit-result error">{result}</p>
            <div className="dialog-actions">
              <button className="dialog-btn cancel" onClick={onClose}>
                Close
              </button>
              <button
                className="dialog-btn primary"
                onClick={() => setStatus("idle")}
              >
                Retry
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="commit-file-section">
              <div className="commit-file-header">
                <label className="commit-toggle-all">
                  <input
                    type="checkbox"
                    checked={
                      changedFiles.length > 0 &&
                      selectedFiles.size === changedFiles.length
                    }
                    onChange={toggleAll}
                    disabled={loadingFiles || changedFiles.length === 0}
                  />
                  <span>
                    Changed files
                    {!loadingFiles &&
                      ` (${selectedFiles.size}/${changedFiles.length})`}
                  </span>
                </label>
              </div>
              <div className="commit-file-list">
                {loadingFiles ? (
                  <div className="commit-file-empty">Loading...</div>
                ) : changedFiles.length === 0 ? (
                  <div className="commit-file-empty">No changes</div>
                ) : (
                  changedFiles.map((file) => (
                    <label key={file} className="commit-file-item">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file)}
                        onChange={() => toggleFile(file)}
                      />
                      <span className="commit-file-path">{file}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <label className="dialog-field">
              <span>Commit message</span>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoFocus
                placeholder="Describe your changes..."
                disabled={status === "committing"}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-btn cancel"
                onClick={onClose}
                disabled={status === "committing"}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dialog-btn primary"
                disabled={
                  !message.trim() ||
                  selectedFiles.size === 0 ||
                  status === "committing"
                }
              >
                {status === "committing"
                  ? "Committing..."
                  : selectedFiles.size === changedFiles.length
                    ? "Commit All"
                    : `Commit (${selectedFiles.size})`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
