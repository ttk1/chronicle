from pathlib import Path

import frontmatter
from fastapi import HTTPException

VAULT_DIR = Path("/app/vault")


def resolve_path(rel_path: str) -> Path:
    """Resolve and validate a path within the vault."""
    resolved = (VAULT_DIR / rel_path).resolve()
    if not str(resolved).startswith(str(VAULT_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return resolved


def parse_frontmatter(file_path: Path) -> dict:
    """Parse frontmatter metadata from a markdown file."""
    try:
        post = frontmatter.load(str(file_path))
        return dict(post.metadata)
    except Exception:
        return {}
