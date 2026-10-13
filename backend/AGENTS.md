# Backend

FastAPI app managed with uv (`pyproject.toml`). Python 3.12+.

- `app/main.py` - FastAPI app. `GET /api/health` returns `{"status":"ok"}`. `create_app(static_dir, db_path)` builds the app, initialises the database and serves `static_dir` at `/`. The module-level `app` uses env `DB_PATH` and env `STATIC_DIR` (default `backend/static`). In Docker, the built Next.js export is copied to `static/`; for local e2e, `STATIC_DIR=../frontend/out`.
- `app/board.py` - Pydantic `Board` / `Column` / `Card` models with the validation rules (5 fixed column ids, every card in exactly one column, no blank titles), the default demo board, and pure operations `create_card`, `update_card`, `move_card`, `delete_card`, `rename_column` (raise `NotFoundError`; the app maps it to 404). The AI feature will reuse these operations.
- `app/db.py` - SQLite via stdlib `sqlite3`: `init_db` creates the file, tables, user `user` and default board if missing; `get_user_id`, `get_board`, `save_board`. Path from env `DB_PATH`, default `backend/data/pm.db` (git-ignored).
- `app/api.py` - routes, all need a session and are scoped to the signed-in user; every mutating route returns the full updated board: `GET/PUT /api/board`, `POST /api/cards`, `PATCH/DELETE /api/cards/{id}`, `POST /api/cards/{id}/move` (`column_id`, optional `position`), `PATCH /api/columns/{id}`, and `POST /api/chat` (`message`, optional `history` of `{role, content}`): asks the model, applies its operations one by one to a copy of the board (invalid ones are skipped), saves, returns `{message, board, applied, skipped}`; AI failure is 502. 404 for unknown ids, 422 for invalid input; a board is validated again before it is saved.
- `app/auth.py` - hardcoded user (`user` / `password`); `POST /api/login` (JSON body, 401 on bad credentials, 422 on missing fields), `POST /api/logout` (204), `GET /api/me` (401 without a session). `current_user` is the dependency the board routes use to require a session. Sessions are Starlette `SessionMiddleware` signed cookies (HttpOnly, SameSite=Lax); secret from env `SESSION_SECRET` with a dev default.
- `app/ai.py` - OpenRouter via the `openai` SDK. `complete(messages, response_format)` is the only function that touches the network (hardcoded `MODEL`, 60 s timeout, no retries, key `OPENROUTER_API_KEY` from the project-root `.env` or the environment, read lazily; every failure becomes `AIError`, including OpenRouter's 200-with-error body). `chat(board, history, message)` sends the system prompt + board JSON + history + message with a JSON-schema `response_format` and returns a validated `Reply` (`message` + list of `operations`: create_card, update_card, move_card, delete_card, rename_column). `ask(prompt)` is a plain one-shot call. With env `AI_STUB` set, `complete` is replaced by `stub_complete` (offline, used by the Playwright run): `STUB:{json}` in the last message is returned as the reply, a message containing "fail" raises `AIError`, anything else gets a plain reply.
- `tests/conftest.py` - fixtures: `client` (signed out), `auth_client` (signed in), `make_client` (new app on the same temp DB, to simulate a restart)
- `tests/test_board.py`, `tests/test_db.py`, `tests/test_api.py` - rules and operations, database behaviour, routes and integration flows
- `tests/test_auth.py` - login/logout flow, bad credentials, missing fields, tampered cookie, per-client sessions.
- `tests/test_main.py` - unit tests for the routes (using a temp static dir).
- `tests/test_ai.py` - live tests (marker `live`, skipped without a key, no mocks): 2+2, create/move/question through `ai.chat`, and a full `/api/chat` run against the stored board.
- `tests/test_chat.py` - chat route tests with only `ai.complete` mocked (every operation type, ordering, skipped operations, prompt contents, history, malformed output, errors, 401), plus `complete()` with a fake SDK client.
- `tests/test_docker.py` - integration test (marker `docker`): builds the image, runs the container, hits `/` and `/api/health`, runs the login flow, reads and changes the board, and checks it survives a container restart (takes about 1-2 minutes: it builds the frontend).

## Commands (run from `backend/`)

- `uv run pytest` - unit + integration tests, with coverage report (target about 80%, not enforced). Excludes `live` and `docker` markers.
- `uv run pytest -m live --no-cov` - live OpenRouter test (slow: the free model took about 40 s).
- `uv run pytest -m docker --no-cov` - Docker integration test.
- `uv run uvicorn app.main:app --reload` - run locally on port 8000.
