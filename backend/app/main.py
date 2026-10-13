import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import api, db
from app.auth import router as auth_router
from app.board import NotFoundError

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_STATIC_DIR = BACKEND_DIR / "static"
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "pm.db"
# Local MVP only; set SESSION_SECRET to override.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-secret-change-me")


def create_app(static_dir: Path, db_path: Path) -> FastAPI:
    db.init_db(db_path)
    app = FastAPI()
    app.state.db_path = db_path
    app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")

    @app.exception_handler(NotFoundError)
    def not_found(request: Request, error: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(api.router)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app(
    Path(os.environ.get("STATIC_DIR", DEFAULT_STATIC_DIR)),
    Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH)),
)
