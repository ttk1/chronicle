from __future__ import annotations

import re
from pathlib import Path

import frontmatter
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import VAULT_DIR

router = APIRouter()


class SearchMatch(BaseModel):
    line: int
    context: str


class SearchResultItem(BaseModel):
    path: str
    title: str
    type: str
    matches: list[SearchMatch]


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResultItem]


def _extract_context(
    line_text: str, match_start: int, match_end: int, radius: int = 30
) -> str:
    start = max(0, match_start - radius)
    end = min(len(line_text), match_end + radius)
    prefix = ("..." if start > 0 else "") + line_text[start:match_start]
    keyword = line_text[match_start:match_end]
    suffix = line_text[match_end:end] + ("..." if end < len(line_text) else "")
    return f"{prefix}**{keyword}**{suffix}"


def _find_frontmatter_end(lines: list[str]) -> int:
    """Return the line index (0-based) where frontmatter ends.

    If the file starts with '---', find the closing '---' and return
    the index of the line after it.  Otherwise return 0.
    """
    if not lines or lines[0].rstrip() != "---":
        return 0
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            return i + 1
    return 0


@router.get("/search", response_model=SearchResponse)
def search_notes(
    q: str = Query(..., min_length=1),
    regex: bool = False,
    case: bool = False,
    type: str | None = None,
    path: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> SearchResponse:
    flags = 0 if case else re.IGNORECASE
    try:
        pattern = re.compile(q if regex else re.escape(q), flags)
    except re.error as e:
        raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")

    all_results: list[SearchResultItem] = []

    for md_file in sorted(VAULT_DIR.rglob("*.md")):
        rel = md_file.relative_to(VAULT_DIR).as_posix()

        # Skip assets directory
        if rel.startswith("assets/"):
            continue

        # Apply path prefix filter
        if path and not rel.startswith(path):
            continue

        # Read file
        try:
            text = md_file.read_text(encoding="utf-8")
        except Exception:
            continue

        # Parse frontmatter for metadata
        try:
            post = frontmatter.load(str(md_file))
            title = post.get("title", md_file.stem)
            file_type = post.get("type", "note")
        except Exception:
            title = md_file.stem
            file_type = "note"

        # Apply type filter
        if type and file_type != type:
            continue

        lines = text.split("\n")
        fm_end = _find_frontmatter_end(lines)

        matches: list[SearchMatch] = []
        for i in range(fm_end, len(lines)):
            for m in pattern.finditer(lines[i]):
                context = _extract_context(lines[i], m.start(), m.end())
                matches.append(SearchMatch(line=i + 1, context=context))

        if matches:
            all_results.append(
                SearchResultItem(
                    path=rel,
                    title=str(title),
                    type=str(file_type),
                    matches=matches,
                )
            )

    # Sort: more matches first, then alphabetically
    all_results.sort(key=lambda r: (-len(r.matches), r.path))

    total = len(all_results)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = all_results[start:end]

    return SearchResponse(query=q, total=total, results=paginated)
