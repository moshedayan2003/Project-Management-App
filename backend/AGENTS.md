# Backend

FastAPI app managed with uv (`pyproject.toml`). Python 3.12+.

- `app/main.py` - FastAPI app. `GET /api/health` returns `{"status":"ok"}`. `create_app(static_dir)` builds the app and serves `static_dir` at `/`. The module-level `app` uses env `STATIC_DIR` (default `backend/static`). In Docker, the built Next.js export is copied to `static/`; for local e2e, `STATIC_DIR=../frontend/out`.
- `app/auth.py` - hardcoded user (`user` / `password`); `POST /api/login` (JSON body, 401 on bad credentials, 422 on missing fields), `POST /api/logout` (204), `GET /api/me` (401 without a session). `current_user` is the dependency-style helper later routes will use to require a session. Sessions are Starlette `SessionMiddleware` signed cookies (HttpOnly, SameSite=Lax); secret from env `SESSION_SECRET` with a dev default.
- `tests/test_auth.py` - login/logout flow, bad credentials, missing fields, tampered cookie, per-client sessions.
- `tests/test_main.py` - unit tests for the routes (using a temp static dir).
- `tests/test_docker.py` - integration test (marker `docker`): builds the image, runs the container, hits `/` and `/api/health` and runs the login flow (takes about 1-2 minutes: it builds the frontend).

## Commands (run from `backend/`)

- `uv run pytest` - unit + integration tests, with coverage report (target about 80%, not enforced). Excludes `live` and `docker` markers.
- `uv run pytest -m docker --no-cov` - Docker integration test.
- `uv run uvicorn app.main:app --reload` - run locally on port 8000.
