import { useMemo } from "react";
import "./TasksView.css";

interface TaskItem {
  line: number;
  text: string;
  checked: boolean;
  indent: number;
}

function parseTasks(markdown: string): TaskItem[] {
  const lines = markdown.split("\n");
  const tasks: TaskItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)- \[([ xX])\] (.*)$/);
    if (match) {
      tasks.push({
        line: i,
        indent: match[1].length,
        checked: match[2] !== " ",
        text: match[3],
      });
    }
  }
  return tasks;
}

function computeProgress(tasks: TaskItem[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.checked).length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

interface TasksViewProps {
  content: string;
  onToggle: (lineIndex: number) => void;
}

export default function TasksView({ content, onToggle }: TasksViewProps) {
  const tasks = useMemo(() => parseTasks(content), [content]);
  const progress = useMemo(() => computeProgress(tasks), [tasks]);

  return (
    <div className="tasks-view">
      <div className="tasks-progress">
        <div className="tasks-progress-bar">
          <div
            className="tasks-progress-fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <span className="tasks-progress-text">
          {progress.done}/{progress.total} ({progress.percent}%)
        </span>
      </div>
      <ul className="tasks-list">
        {tasks.map((task) => (
          <li
            key={task.line}
            className={`tasks-item ${task.checked ? "checked" : ""}`}
            style={{ paddingLeft: `${16 + task.indent * 12}px` }}
          >
            <label className="tasks-label">
              <input
                type="checkbox"
                checked={task.checked}
                onChange={() => onToggle(task.line)}
              />
              <span className="tasks-text">{task.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
