import { useCallback, useEffect, useState } from "react";
import {
  createDailyToday,
  getDailyCalendar,
  type DailyEntry,
} from "../api";
import "./CalendarView.css";

interface CalendarViewProps {
  onOpenNote: (path: string) => void;
  onClose: () => void;
  onCreated: () => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarView({
  onOpenNote,
  onClose,
  onCreated,
}: CalendarViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadCalendar = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const data = await getDailyCalendar(y, m);
      setEntries(data.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendar(year, month);
  }, [year, month, loadCalendar]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleCreateToday = async () => {
    setCreating(true);
    try {
      const result = await createDailyToday();
      onCreated();
      await loadCalendar(year, month);
      onOpenNote(result.path);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  // Build entry lookup: day number -> entry
  const entryMap = new Map<number, DailyEntry>();
  for (const e of entries) {
    const day = parseInt(e.date.split("-")[2], 10);
    entryMap.set(day, e);
  }

  // Calendar grid computation
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday=0, Sunday=6
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const isCurrentMonth = year === todayYear && month === todayMonth;

  // Build cells: null = empty, number = day
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Fill remaining to complete the last week
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="calendar-panel">
      <div className="calendar-header">
        <span className="calendar-title">Calendar</span>
        <button className="calendar-close-btn" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={prevMonth}>
          &lt;
        </button>
        <span className="calendar-month-label">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button className="calendar-nav-btn" onClick={nextMonth}>
          &gt;
        </button>
      </div>
      {isCurrentMonth && (
        <button
          className="calendar-today-btn"
          onClick={handleCreateToday}
          disabled={creating}
        >
          {creating ? "Creating..." : "Today's Report"}
        </button>
      )}
      {loading ? (
        <div className="calendar-loading">Loading...</div>
      ) : (
        <div className="calendar-grid">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="calendar-weekday">
              {wd}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="calendar-day empty" />;
            }
            const entry = entryMap.get(day);
            const isToday = isCurrentMonth && day === todayDay;
            const cls = [
              "calendar-day",
              entry ? "has-entry" : "",
              isToday ? "today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={day}
                className={cls}
                onClick={() => entry && onOpenNote(entry.path)}
                title={entry ? entry.title : undefined}
              >
                {day}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
