from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import notes, pages

app = FastAPI(title="Chronicle API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notes.router, prefix="/api")
app.include_router(pages.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
