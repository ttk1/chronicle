from __future__ import annotations

from pathlib import Path

import git as gitmodule
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.routers.maintenance import run_gc

router = APIRouter()

VAULT_DIR = Path("/app/vault")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    message: str


class CommitInfo(BaseModel):
    hash: str
    short_hash: str
    author: str
    date: str
    message: str


class CommitLogResponse(BaseModel):
    commits: list[CommitInfo]
    total: int
    page: int
    per_page: int


class DiffFile(BaseModel):
    path: str
    change_type: str
    diff_text: str


class DiffResponse(BaseModel):
    hash: str
    message: str
    author: str
    date: str
    files: list[DiffFile]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_repo() -> gitmodule.Repo:
    """Get or initialize the vault git repository."""
    try:
        repo = gitmodule.Repo(str(VAULT_DIR))
    except gitmodule.InvalidGitRepositoryError:
        repo = gitmodule.Repo.init(str(VAULT_DIR))

    # Ensure user identity is configured
    with repo.config_writer("repository") as cw:
        if not cw.has_option("user", "name"):
            cw.set_value("user", "name", "Chronicle")
        if not cw.has_option("user", "email"):
            cw.set_value("user", "email", "chronicle@localhost")

    return repo


def _commit_to_info(commit: gitmodule.Commit) -> CommitInfo:
    return CommitInfo(
        hash=commit.hexsha,
        short_hash=commit.hexsha[:7],
        author=str(commit.author),
        date=commit.committed_datetime.isoformat(),
        message=commit.message.strip(),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/git/commit", response_model=CommitInfo)
def git_commit(body: CommitRequest):
    """Run GC, stage all changes, and commit."""
    # Run garbage collection before commit
    run_gc()

    repo = _get_repo()
    repo.git.add("-A")

    # Check if there are changes to commit
    if not repo.is_dirty(untracked_files=True) and not repo.index.diff("HEAD"):
        raise HTTPException(status_code=200, detail="Nothing to commit")

    try:
        commit = repo.index.commit(body.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Commit failed: {e}")

    return _commit_to_info(commit)


@router.get("/git/log", response_model=CommitLogResponse)
def git_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Return paginated commit history."""
    repo = _get_repo()

    try:
        total = int(repo.git.rev_list("--count", "HEAD"))
    except gitmodule.GitCommandError:
        return CommitLogResponse(commits=[], total=0, page=page, per_page=per_page)

    skip = (page - 1) * per_page
    try:
        commits = list(repo.iter_commits(max_count=per_page, skip=skip))
    except gitmodule.GitCommandError:
        commits = []

    return CommitLogResponse(
        commits=[_commit_to_info(c) for c in commits],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/git/diff/{commit_hash}", response_model=DiffResponse)
def git_diff(commit_hash: str):
    """Return diff for a specific commit."""
    repo = _get_repo()

    try:
        commit = repo.commit(commit_hash)
    except (gitmodule.BadName, ValueError):
        raise HTTPException(status_code=404, detail="Commit not found")

    # Get diff against parent (or NULL_TREE for initial commit)
    if commit.parents:
        diffs = commit.diff(commit.parents[0], create_patch=True)
    else:
        diffs = commit.diff(gitmodule.NULL_TREE, create_patch=True)

    files: list[DiffFile] = []
    for d in diffs:
        path = d.b_path or d.a_path or ""
        change_type = d.change_type or "M"

        # Handle binary files
        try:
            diff_text = d.diff.decode("utf-8", errors="replace") if d.diff else ""
        except Exception:
            diff_text = "[binary file]"

        files.append(DiffFile(path=path, change_type=change_type, diff_text=diff_text))

    return DiffResponse(
        hash=commit.hexsha,
        message=commit.message.strip(),
        author=str(commit.author),
        date=commit.committed_datetime.isoformat(),
        files=files,
    )


@router.post("/git/restore/{commit_hash}", response_model=CommitInfo)
def git_restore(commit_hash: str):
    """Restore vault to a specific commit state and create a new commit."""
    repo = _get_repo()

    try:
        repo.commit(commit_hash)
    except (gitmodule.BadName, ValueError):
        raise HTTPException(status_code=404, detail="Commit not found")

    try:
        repo.git.checkout(commit_hash, "--", ".")
        repo.git.add("-A")
        new_commit = repo.index.commit(f"Restored to {commit_hash[:7]}")
    except gitmodule.GitCommandError as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")

    return _commit_to_info(new_commit)
