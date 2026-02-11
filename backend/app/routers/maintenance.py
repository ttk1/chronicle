from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

VAULT_DIR = Path("/app/vault")
IMAGES_DIR = VAULT_DIR / "assets" / "images"

GRACE_PERIOD = timedelta(minutes=5)

# Patterns to detect image references in markdown
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
HTML_IMAGE_RE = re.compile(r"<img\s[^>]*src=[\"']([^\"']+)[\"']", re.IGNORECASE)

# Pattern to detect all markdown links (including images)
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)#][^)]*)\)")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class GCPreviewResponse(BaseModel):
    candidates: list[str]
    total_size: int


class GCResult(BaseModel):
    deleted: list[str]
    total_size: int


class BrokenLink(BaseModel):
    file: str
    line: int
    link: str
    suggestion: str | None = None


class LinkCheckResponse(BaseModel):
    broken: list[BrokenLink]


# ---------------------------------------------------------------------------
# GC Helpers
# ---------------------------------------------------------------------------

def _extract_image_filename(path: str, source_file: Path) -> str | None:
    """Resolve a possibly-relative image path to a filename in assets/images/."""
    if path.startswith("http://") or path.startswith("https://"):
        return None

    resolved = (source_file.parent / path).resolve()
    try:
        rel = resolved.relative_to(IMAGES_DIR.resolve())
        # Only direct children of images dir
        if "/" not in str(rel) and "\\" not in str(rel):
            return rel.name
    except ValueError:
        pass
    return None


def _find_referenced_images() -> set[str]:
    """Scan all .md files and return set of referenced image filenames."""
    referenced: set[str] = set()

    for md_file in VAULT_DIR.rglob("*.md"):
        try:
            text = md_file.read_text(encoding="utf-8")
        except Exception:
            continue

        # Search full text including HTML comments (spec: commented refs count)
        for match in MD_IMAGE_RE.finditer(text):
            name = _extract_image_filename(match.group(1), md_file)
            if name:
                referenced.add(name)

        for match in HTML_IMAGE_RE.finditer(text):
            name = _extract_image_filename(match.group(1), md_file)
            if name:
                referenced.add(name)

    return referenced


def _is_within_grace_period(file_path: Path) -> bool:
    """Check if file was created/modified within the grace period."""
    mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
    return datetime.now(timezone.utc) - mtime < GRACE_PERIOD


def _get_gc_candidates() -> list[Path]:
    """Return list of unreferenced image files eligible for deletion."""
    if not IMAGES_DIR.exists():
        return []

    referenced = _find_referenced_images()
    candidates: list[Path] = []

    for f in IMAGES_DIR.iterdir():
        if not f.is_file() or f.name.startswith("."):
            continue
        if f.name not in referenced and not _is_within_grace_period(f):
            candidates.append(f)

    return candidates


def run_gc() -> GCResult:
    """Execute garbage collection: delete unreferenced images."""
    candidates = _get_gc_candidates()
    deleted: list[str] = []
    total_size = 0

    for f in candidates:
        size = f.stat().st_size
        f.unlink()
        deleted.append(f.name)
        total_size += size

    return GCResult(deleted=deleted, total_size=total_size)


# ---------------------------------------------------------------------------
# Link Check Helpers
# ---------------------------------------------------------------------------

def _suggest_fix(broken_target: str) -> str | None:
    """Find a similar file that might be the intended target."""
    target_stem = Path(broken_target).stem.lower()
    if not target_stem:
        return None

    best: str | None = None
    best_score = 0.0

    all_files = list(VAULT_DIR.rglob("*.md"))
    if IMAGES_DIR.exists():
        all_files.extend(IMAGES_DIR.iterdir())

    for f in all_files:
        if not f.is_file():
            continue
        stem = f.stem.lower()
        common = len(set(target_stem) & set(stem))
        total = max(len(target_stem), len(stem), 1)
        score = common / total
        if score > best_score and score > 0.5:
            best_score = score
            best = f.relative_to(VAULT_DIR).as_posix()

    return best


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/gc/preview", response_model=GCPreviewResponse)
def gc_preview():
    """Preview what GC would delete without actually deleting."""
    candidates = _get_gc_candidates()
    return GCPreviewResponse(
        candidates=[f.name for f in candidates],
        total_size=sum(f.stat().st_size for f in candidates),
    )


@router.post("/gc", response_model=GCResult)
def gc_execute():
    """Run garbage collection: delete unreferenced images."""
    return run_gc()


@router.get("/links/check", response_model=LinkCheckResponse)
def check_links():
    """Detect broken links across all markdown files."""
    broken: list[BrokenLink] = []

    for md_file in sorted(VAULT_DIR.rglob("*.md")):
        rel = md_file.relative_to(VAULT_DIR).as_posix()
        if rel.startswith("assets/"):
            continue

        try:
            lines = md_file.read_text(encoding="utf-8").split("\n")
        except Exception:
            continue

        for i, line in enumerate(lines):
            for match in LINK_RE.finditer(line):
                link_target = match.group(1).strip()

                # Skip external URLs
                if link_target.startswith("http://") or link_target.startswith("https://"):
                    continue
                # Skip mailto and other protocols
                if ":" in link_target.split("/")[0] and not link_target.startswith("."):
                    continue

                # Resolve relative to source file
                resolved = (md_file.parent / link_target).resolve()
                if not resolved.exists():
                    suggestion = _suggest_fix(link_target)
                    broken.append(BrokenLink(
                        file=rel,
                        line=i + 1,
                        link=link_target,
                        suggestion=suggestion,
                    ))

    return LinkCheckResponse(broken=broken)
