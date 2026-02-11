from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import frontmatter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

VAULT_DIR = Path("/app/vault")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class TreeNode(BaseModel):
    name: str
    title: str | None = None
    type: str | None = None
    path: str | None = None
    children: list[TreeNode] = []


class PageCreate(BaseModel):
    title: str
    type: str = "note"


class PageMove(BaseModel):
    destination: str  # new path relative to vault root


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_path(rel_path: str) -> Path:
    resolved = (VAULT_DIR / rel_path).resolve()
    if not str(resolved).startswith(str(VAULT_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return resolved


def _parse_frontmatter(file_path: Path) -> dict:
    try:
        post = frontmatter.load(str(file_path))
        return dict(post.metadata)
    except Exception:
        return {}


def _build_tree(directory: Path) -> list[TreeNode]:
    """Recursively build a tree of pages from a directory."""
    children: list[TreeNode] = []

    if not directory.is_dir():
        return children

    entries = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name))

    for entry in entries:
        if entry.name.startswith(".") or entry.name == "assets":
            continue

        if entry.is_dir():
            # Directory = parent page
            index_file = entry / "_index.md"
            meta = _parse_frontmatter(index_file) if index_file.exists() else {}
            node = TreeNode(
                name=entry.name,
                title=meta.get("title", entry.name),
                type=meta.get("type"),
                path=(index_file.relative_to(VAULT_DIR).as_posix()
                      if index_file.exists() else None),
                children=_build_tree(entry),
            )
            children.append(node)
        elif entry.suffix == ".md" and entry.name != "_index.md":
            # Regular markdown file
            meta = _parse_frontmatter(entry)
            rel = entry.relative_to(VAULT_DIR).as_posix()
            node = TreeNode(
                name=entry.name,
                title=meta.get("title", entry.stem),
                type=meta.get("type", "note"),
                path=rel,
            )
            children.append(node)

    return children


TEMPLATES: dict[str, str] = {
    "note": (
        "---\n"
        "title: {title}\n"
        "type: note\n"
        "created: {created}\n"
        "tags: []\n"
        "---\n\n"
        "# {title}\n\n"
    ),
    "daily": (
        "---\n"
        "title: {title}\n"
        "type: daily\n"
        "created: {created}\n"
        "---\n\n"
        "## やったこと\n\n\n"
        "## 明日やること\n\n"
    ),
    "tasks": (
        "---\n"
        "title: {title}\n"
        "type: tasks\n"
        "created: {created}\n"
        "tags: []\n"
        "---\n\n"
        "- [ ] \n"
    ),
    "kanban": (
        "---\n"
        "title: {title}\n"
        "type: kanban\n"
        "created: {created}\n"
        "tags: []\n"
        "---\n\n"
        "## TODO\n\n"
        "- [ ] \n\n"
        "## Doing\n\n\n"
        "## Done\n\n"
    ),
}


def _slugify(text: str) -> str:
    """Convert title to a filesystem-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "untitled"


def _update_links_in_file(file_path: Path, old_rel: str, new_rel: str) -> bool:
    """Update markdown links in a file that reference old_rel to point to new_rel.
    Returns True if any changes were made."""
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception:
        return False

    # Compute relative paths from the file's directory to old and new locations
    file_dir = file_path.parent
    try:
        old_target = (VAULT_DIR / old_rel).resolve()
        new_target = (VAULT_DIR / new_rel).resolve()
        old_link = Path(old_target).relative_to(file_dir.resolve()).as_posix()
        new_link = Path(new_target).relative_to(file_dir.resolve()).as_posix()
    except ValueError:
        # Can't compute relative path, use vault-relative
        old_link = old_rel
        new_link = new_rel

    # Replace all markdown link/image references
    # Patterns: [text](old_link) and ![alt](old_link)
    updated = text.replace(f"]({old_link})", f"]({new_link})")
    # Also handle with ./ prefix
    updated = updated.replace(f"](./{old_link})", f"](./{new_link})")

    if updated != text:
        file_path.write_text(updated, encoding="utf-8")
        return True
    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_tree():
    """Return the full vault tree structure."""
    root_children = _build_tree(VAULT_DIR)
    return {"name": "vault", "children": root_children}


@router.post("/pages/{parent_path:path}/create")
def create_page(parent_path: str, body: PageCreate):
    """Create a child page under the given parent path."""
    parent = _resolve_path(parent_path)

    # Parent may be a file or directory
    if parent.is_file():
        parent_dir = parent.parent
    elif parent.is_dir():
        parent_dir = parent
    else:
        raise HTTPException(status_code=404, detail="Parent not found")

    slug = _slugify(body.title)
    file_path = parent_dir / f"{slug}.md"

    if file_path.exists():
        raise HTTPException(status_code=409, detail="Page already exists")

    now = datetime.now(timezone.utc).astimezone().isoformat()
    template = TEMPLATES.get(body.type, TEMPLATES["note"])
    content = template.format(title=body.title, created=now)

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")

    rel = file_path.relative_to(VAULT_DIR).as_posix()
    return {"path": rel, "status": "created"}


@router.put("/pages/{page_path:path}/move")
def move_page(page_path: str, body: PageMove):
    """Move a page and update all referring links."""
    src = _resolve_path(page_path)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")

    dst = _resolve_path(body.destination)
    if dst.exists():
        raise HTTPException(status_code=409, detail="Destination already exists")

    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)

    # Update links in all markdown files
    for md_file in VAULT_DIR.rglob("*.md"):
        _update_links_in_file(md_file, page_path, body.destination)

    return {
        "from": page_path,
        "to": body.destination,
        "status": "moved",
    }


@router.get("/templates/{page_type}")
def get_template(page_type: str):
    """Get a page template by type."""
    template = TEMPLATES.get(page_type)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    now = datetime.now(timezone.utc).astimezone().isoformat()
    return {
        "type": page_type,
        "content": template.format(title="", created=now),
    }
