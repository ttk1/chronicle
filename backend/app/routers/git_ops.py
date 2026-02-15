from __future__ import annotations

import re
from pathlib import Path

import git as gitmodule
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import VAULT_DIR, resolve_path
from app.routers.maintenance import run_gc

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    message: str
    files: list[str] | None = None


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


class WorkingDiffResponse(BaseModel):
    path: str
    diff_text: str
    has_changes: bool


class GitStatusResponse(BaseModel):
    files: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_repo_identity_configured = False


def _get_repo() -> gitmodule.Repo:
    """Get or initialize the vault git repository."""
    global _repo_identity_configured
    try:
        repo = gitmodule.Repo(str(VAULT_DIR))
    except gitmodule.InvalidGitRepositoryError:
        repo = gitmodule.Repo.init(str(VAULT_DIR))

    # Ensure user identity is configured (once per process)
    if not _repo_identity_configured:
        with repo.config_writer("repository") as cw:
            if not cw.has_option("user", "name"):
                cw.set_value("user", "name", "Chronicle")
            if not cw.has_option("user", "email"):
                cw.set_value("user", "email", "chronicle@localhost")
        _repo_identity_configured = True

    return repo


def _commit_to_info(commit: gitmodule.Commit) -> CommitInfo:
    return CommitInfo(
        hash=commit.hexsha,
        short_hash=commit.hexsha[:7],
        author=str(commit.author),
        date=commit.committed_datetime.isoformat(),
        message=commit.message.strip(),
    )


_COMMIT_HASH_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")


def _validate_commit_hash(h: str) -> str:
    """Validate that a string looks like a git commit hash."""
    if not _COMMIT_HASH_RE.match(h):
        raise HTTPException(status_code=400, detail="Invalid commit hash")
    return h


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/git/commit", response_model=CommitInfo)
def git_commit(body: CommitRequest):
    """Stage changes and commit. If files specified, stage only those files."""
    if body.files:
        # Validate all paths before staging
        for f in body.files:
            resolve_path(f)
        repo = _get_repo()
        for f in body.files:
            repo.git.add(f)
    else:
        # Stage all — run GC first for full commits
        run_gc()
        repo = _get_repo()
        repo.git.add("-A")

    # Check if there are staged changes
    try:
        staged = repo.index.diff("HEAD")
    except gitmodule.BadName:
        staged = repo.index.diff(gitmodule.NULL_TREE)
    if not staged and not repo.index.diff(None):
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
    _validate_commit_hash(commit_hash)
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
    _validate_commit_hash(commit_hash)
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


@router.get("/git/status", response_model=GitStatusResponse)
def git_status():
    """Return list of uncommitted file paths."""
    repo = _get_repo()
    try:
        output = repo.git.status("--porcelain")
    except gitmodule.GitCommandError:
        return GitStatusResponse(files=[])

    if not output.strip():
        return GitStatusResponse(files=[])

    files: list[str] = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        # porcelain format: XY FILENAME
        # Split on whitespace, take everything after the status code
        parts = line.strip().split(None, 1)
        if len(parts) < 2:
            continue
        raw_path = parts[1]
        # Handle renames: "old -> new"
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ")[-1]
        files.append(raw_path)
    return GitStatusResponse(files=files)


@router.get("/git/file-log/{file_path:path}", response_model=CommitLogResponse)
def git_file_log(
    file_path: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Return paginated commit history for a specific file."""
    resolve_path(file_path)  # validate path is within vault
    repo = _get_repo()

    try:
        total = int(repo.git.rev_list("--count", "HEAD", "--", file_path))
    except gitmodule.GitCommandError:
        return CommitLogResponse(commits=[], total=0, page=page, per_page=per_page)

    skip = (page - 1) * per_page
    try:
        commits = list(repo.iter_commits(paths=file_path, max_count=per_page, skip=skip))
    except gitmodule.GitCommandError:
        commits = []

    return CommitLogResponse(
        commits=[_commit_to_info(c) for c in commits],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/git/diff-working/{file_path:path}", response_model=WorkingDiffResponse)
def git_diff_working(file_path: str):
    """Return working tree diff for a specific file against HEAD."""
    full_path = resolve_path(file_path)  # validate path is within vault
    repo = _get_repo()
    diff_text = ""

    try:
        diff_text = repo.git.diff("HEAD", "--", file_path)
    except gitmodule.GitCommandError:
        pass

    # If no diff from HEAD, check if the file is untracked (new file)
    if not diff_text.strip():
        try:
            status_output = repo.git.status("--porcelain", "--", file_path)
            if status_output.strip().startswith("??"):
                if full_path.exists():
                    try:
                        file_content = full_path.read_text(encoding="utf-8")
                        lines = "\n".join(f"+{l}" for l in file_content.split("\n"))
                        diff_text = f"--- /dev/null\n+++ b/{file_path}\n{lines}"
                    except Exception:
                        pass
        except gitmodule.GitCommandError:
            pass

    return WorkingDiffResponse(
        path=file_path,
        diff_text=diff_text,
        has_changes=bool(diff_text.strip()),
    )


@router.post("/git/restore-file/{commit_hash}/{file_path:path}", response_model=CommitInfo)
def git_restore_file(commit_hash: str, file_path: str):
    """Restore a single file from a specific commit and create a new commit."""
    _validate_commit_hash(commit_hash)
    resolve_path(file_path)  # validate path is within vault
    repo = _get_repo()

    try:
        repo.commit(commit_hash)
    except (gitmodule.BadName, ValueError):
        raise HTTPException(status_code=404, detail="Commit not found")

    try:
        repo.git.checkout(commit_hash, "--", file_path)
        repo.git.add(file_path)
        new_commit = repo.index.commit(
            f"Restored {file_path} to {commit_hash[:7]}"
        )
    except gitmodule.GitCommandError as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")

    return _commit_to_info(new_commit)
