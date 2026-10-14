from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import config, db
from app.routes import auth, board, chat
from app.services.board_ops import NotFoundError


def create_app(static_dir: Path, db_path: Path) -> FastAPI:
    db.init_db(db_path)
    app = FastAPI()
    app.state.db_path = db_path
    app.add_middleware(SessionMiddleware, secret_key=config.SESSION_SECRET, same_site="lax")

    @app.exception_handler(NotFoundError)
    def not_found(request: Request, error: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    for module in (auth, board, chat):
        app.include_router(module.router)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app(config.STATIC_DIR, config.DB_PATH)
