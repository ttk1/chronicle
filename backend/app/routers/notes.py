from pathlib import Path

import frontmatter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import VAULT_DIR, resolve_path

router = APIRouter()


class NoteUpdate(BaseModel):
    content: str


class NoteMeta(BaseModel):
    path: str
    title: str
    type: str
    created: str | None = None
    tags: list[str] = []


def _parse_note(file_path: Path, rel_path: str) -> NoteMeta:
    """Parse frontmatter from a markdown file."""
    post = frontmatter.load(str(file_path))
    return NoteMeta(
        path=rel_path,
        title=post.get("title", file_path.stem),
        type=post.get("type", "note"),
        created=str(post.get("created", "")),
        tags=post.get("tags", []),
    )


@router.get("/notes", response_model=list[NoteMeta])
def list_notes():
    """List all markdown notes in the vault."""
    notes = []
    for md_file in sorted(VAULT_DIR.rglob("*.md")):
        rel = md_file.relative_to(VAULT_DIR).as_posix()
        try:
            notes.append(_parse_note(md_file, rel))
        except Exception:
            continue
    return notes


@router.get("/notes/{note_path:path}")
def get_note(note_path: str):
    """Get a note's raw markdown content."""
    file_path = resolve_path(note_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Note not found")
    return {"path": note_path, "content": file_path.read_text(encoding="utf-8")}


@router.put("/notes/{note_path:path}")
def save_note(note_path: str, body: NoteUpdate):
    """Save (create or update) a note."""
    file_path = resolve_path(note_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(body.content, encoding="utf-8")
    return {"path": note_path, "status": "saved"}


@router.delete("/notes/{note_path:path}")
def delete_note(note_path: str):
    """Delete a note."""
    file_path = resolve_path(note_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Note not found")
    file_path.unlink()
    # Clean up empty parent directories up to vault root
    parent = file_path.parent
    while parent != VAULT_DIR and parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()
        parent = parent.parent
    return {"path": note_path, "status": "deleted"}
