from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import assets, daily, git_ops, maintenance, notes, pages, search

app = FastAPI(title="Chronicle API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notes.router, prefix="/api")
app.include_router(pages.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(git_ops.router, prefix="/api")
app.include_router(maintenance.router, prefix="/api")
app.include_router(daily.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
