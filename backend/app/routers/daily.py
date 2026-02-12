from __future__ import annotations

import re
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.config import VAULT_DIR, parse_frontmatter

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class DailyCreateRequest(BaseModel):
    date: str | None = None  # YYYY-MM-DD, defaults to server's today


class DailyEntry(BaseModel):
    date: str
    path: str
    title: str


class DailyCalendarResponse(BaseModel):
    year: int
    month: int
    entries: list[DailyEntry]


class DailyMonthsResponse(BaseModel):
    months: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_previous_daily(today: date) -> Path | None:
    """Find the most recent daily report before *today*."""
    daily_dir = VAULT_DIR / "daily"
    if not daily_dir.exists():
        return None

    candidates: list[tuple[date, Path]] = []
    for month_dir in daily_dir.iterdir():
        if not month_dir.is_dir() or month_dir.name.startswith("."):
            continue
        for md_file in month_dir.glob("*.md"):
            if md_file.name == "_index.md":
                continue
            try:
                d = date.fromisoformat(md_file.stem)
                if d < today:
                    candidates.append((d, md_file))
            except ValueError:
                continue

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def _extract_tomorrow_section(file_path: Path) -> list[str]:
    """Extract lines under '## 明日やること' until the next heading or EOF."""
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception:
        return []

    lines = text.split("\n")
    capturing = False
    result: list[str] = []

    for line in lines:
        if re.match(r"^##\s+明日やること", line):
            capturing = True
            continue
        if capturing:
            if line.strip().startswith("## "):
                break
            if line.strip():
                result.append(line)

    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/daily/today")
def create_daily_today(body: DailyCreateRequest | None = None):
    """Create today's daily report with previous-day carry-forward."""
    if body and body.date:
        try:
            target_date = date.fromisoformat(body.date)
        except ValueError:
            target_date = date.today()
    else:
        target_date = date.today()

    month_str = target_date.strftime("%Y-%m")
    date_str = target_date.isoformat()
    rel_path = f"daily/{month_str}/{date_str}.md"
    abs_path = VAULT_DIR / rel_path

    # Already exists — just return path
    if abs_path.exists():
        return {"path": rel_path, "status": "exists"}

    # Ensure parent directory
    abs_path.parent.mkdir(parents=True, exist_ok=True)

    # Also ensure daily/_index.md exists
    daily_index = VAULT_DIR / "daily" / "_index.md"
    if not daily_index.exists():
        now = datetime.now(timezone.utc).astimezone().isoformat()
        daily_index.write_text(
            f"---\ntitle: Daily\ntype: note\ncreated: {now}\n---\n\n# Daily\n\n",
            encoding="utf-8",
        )

    # Find previous daily and extract carry-forward
    prev = _find_previous_daily(target_date)
    carry_lines = _extract_tomorrow_section(prev) if prev else []

    # Build content
    now = datetime.now(timezone.utc).astimezone().isoformat()
    title = f"{date_str} 日報"

    content_parts = [
        "---\n",
        f"title: {title}\n",
        "type: daily\n",
        f"created: {now}\n",
        "---\n\n",
        "## やったこと\n\n",
    ]

    if carry_lines:
        content_parts.append("> **前日から引き継ぎ:**\n")
        for line in carry_lines:
            content_parts.append(f"> {line}\n")
        content_parts.append("\n")

    content_parts.append("\n## 明日やること\n\n")

    abs_path.write_text("".join(content_parts), encoding="utf-8")

    return {"path": rel_path, "status": "created"}


@router.get("/daily/calendar", response_model=DailyCalendarResponse)
def get_daily_calendar(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
):
    """Return daily report entries for a given month."""
    month_str = f"{year}-{month:02d}"
    month_dir = VAULT_DIR / "daily" / month_str

    entries: list[DailyEntry] = []

    if month_dir.is_dir():
        for md_file in sorted(month_dir.glob("*.md")):
            if md_file.name == "_index.md":
                continue
            try:
                d = date.fromisoformat(md_file.stem)
            except ValueError:
                continue

            meta = parse_frontmatter(md_file)
            rel = md_file.relative_to(VAULT_DIR).as_posix()
            entries.append(DailyEntry(
                date=d.isoformat(),
                path=rel,
                title=meta.get("title", md_file.stem),
            ))

    return DailyCalendarResponse(year=year, month=month, entries=entries)


@router.get("/daily/months", response_model=DailyMonthsResponse)
def get_daily_months():
    """Return list of months that have daily reports."""
    daily_dir = VAULT_DIR / "daily"
    months: list[str] = []

    if daily_dir.is_dir():
        for entry in sorted(daily_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            # Validate YYYY-MM format
            if re.match(r"^\d{4}-\d{2}$", entry.name):
                months.append(entry.name)

    return DailyMonthsResponse(months=months)
