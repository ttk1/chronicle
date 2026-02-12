export const TYPE_ICONS: Record<string, string> = {
  note: "\u{1F4DD}",
  daily: "\u{1F4C5}",
  tasks: "\u{2705}",
  kanban: "\u{1F4CB}",
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
