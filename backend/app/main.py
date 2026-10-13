import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.auth import router as auth_router

DEFAULT_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
# Local MVP only; set SESSION_SECRET to override.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-secret-change-me")


def create_app(static_dir: Path) -> FastAPI:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(auth_router)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app(Path(os.environ.get("STATIC_DIR", DEFAULT_STATIC_DIR)))
