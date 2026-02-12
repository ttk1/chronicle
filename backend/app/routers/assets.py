import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import VAULT_DIR

router = APIRouter()

IMAGES_DIR = VAULT_DIR / "assets" / "images"

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}


@router.post("/assets/upload")
async def upload_asset(file: UploadFile):
    """Upload an image file. Supports clipboard paste."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    # Determine extension
    ext = ""
    if file.filename:
        ext = Path(file.filename).suffix.lower()
    if not ext and file.content_type:
        ct_map = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
        }
        ext = ct_map.get(file.content_type, "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    # Generate filename: YYYYMMDD-{6-char hash}.ext
    date_prefix = datetime.now(timezone.utc).strftime("%Y%m%d")
    short_hash = hashlib.sha256(data).hexdigest()[:6]
    filename = f"{date_prefix}-{short_hash}{ext}"

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    (IMAGES_DIR / filename).write_bytes(data)

    rel_path = f"assets/images/{filename}"
    return {"path": rel_path, "filename": filename}


@router.get("/assets/index")
def list_assets():
    """List all images with metadata for autocomplete."""
    if not IMAGES_DIR.exists():
        return {"images": []}

    images = []
    for f in sorted(IMAGES_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            images.append({
                "filename": f.name,
                "path": f"assets/images/{f.name}",
                "size": f.stat().st_size,
            })
    return {"images": images}


@router.get("/assets/{filename}")
def get_asset(filename: str):
    """Serve an image file."""
    file_path = (IMAGES_DIR / filename).resolve()
    if not str(file_path).startswith(str(IMAGES_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(file_path)
