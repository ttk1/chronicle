import { useState } from "react";
import "./CreatePageDialog.css";

interface CreatePageDialogProps {
  parentPath: string;
  onSubmit: (title: string, type: string) => void;
  onClose: () => void;
}

const PAGE_TYPES = [
  { value: "note", label: "Note" },
  { value: "daily", label: "Daily" },
  { value: "tasks", label: "Tasks" },
  { value: "kanban", label: "Kanban" },
];

export default function CreatePageDialog({
  parentPath,
  onSubmit,
  onClose,
}: CreatePageDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim(), type);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Create New Page</h3>
        <p className="dialog-parent">in: {parentPath || "vault root"}</p>
        <form onSubmit={handleSubmit}>
          <label className="dialog-field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="Page title"
            />
          </label>
          <label className="dialog-field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {PAGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button type="button" className="dialog-btn cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dialog-btn primary" disabled={!title.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
