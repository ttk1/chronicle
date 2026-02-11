import { useState } from "react";
import { gitCommit } from "../api";
import "./CreatePageDialog.css";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("committing");
    try {
      const info = await gitCommit(message.trim());
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
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Git Commit</h3>
        <p className="dialog-parent">
          Commit all changes (runs GC before commit)
        </p>
        {status === "success" ? (
          <>
            <p style={{ color: "#2e7d32", fontSize: "0.85rem" }}>
              Committed: {result}
            </p>
            <div className="dialog-actions">
              <button className="dialog-btn primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : status === "error" ? (
          <>
            <p style={{ color: "#d32f2f", fontSize: "0.85rem" }}>{result}</p>
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
                disabled={!message.trim() || status === "committing"}
              >
                {status === "committing" ? "Committing..." : "Commit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
