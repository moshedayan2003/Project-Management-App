# Backend

FastAPI app managed with uv (`pyproject.toml`). Python 3.12+.

## Commands (run from `backend/`)

| Command | What it does |
|---------|--------------|
| `uv run pytest` | Unit + integration tests with a coverage report (target about 80%, not enforced). Excludes `live` and `docker`. |
| `uv run pytest -m live --no-cov` | Real OpenRouter calls. Slow: the free model can take about 40 s. |
| `uv run pytest -m docker --no-cov` | Builds and runs the Docker image (1 to 2 minutes). |
| `uv run uvicorn app.main:app --reload` | Run locally on port 8000. |

## Environment

| Variable | Used by | Default |
|----------|---------|---------|
| `STATIC_DIR` | `main.py` | `backend/static` (Docker copies the Next.js export here; local e2e uses `../frontend/out`) |
| `DB_PATH` | `db.py` | `backend/data/pm.db` (git-ignored) |
| `SESSION_SECRET` | `auth.py` | a dev-only default |
| `OPENROUTER_API_KEY` | `ai.py` | read lazily from the project-root `.env` or the environment |
| `AI_STUB` | `ai.py` | unset; when set, an offline stub replaces the model (see below) |

## Modules (`app/`)

### `main.py`

- `create_app(static_dir, db_path)` builds the app, initialises the database and serves `static_dir` at `/`.
- The module-level `app` reads `STATIC_DIR` and `DB_PATH` from the environment.
- `GET /api/health` returns `{"status":"ok"}`.

### `board.py`

- Pydantic `Board`, `Column` and `Card` models.
- Validation rules: the 5 fixed column ids, every card in exactly one column, no blank titles.
- The default demo board.
- Pure operations: `create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`. They raise `NotFoundError`, which the app maps to 404. Both the REST routes and the AI chat use them.

### `db.py`

SQLite via stdlib `sqlite3`.

- `init_db` creates the file, tables, user `user` and the default board if missing.
- `get_user_id`, `get_board`, `save_board`.

### `auth.py`

- Hardcoded user `user` / `password`.
- Sessions are Starlette `SessionMiddleware` signed cookies (HttpOnly, SameSite=Lax).
- `current_user` is the dependency every board route uses to require a session.

| Route | Result |
|-------|--------|
| `POST /api/login` | JSON body. 401 on bad credentials, 422 on missing fields. |
| `POST /api/logout` | 204 |
| `GET /api/me` | 401 without a session |

### `api.py`

Every route needs a session and works on the signed-in user's board. Every mutating route returns the full updated board.

| Route | Body / notes |
|-------|--------------|
| `GET /api/board` | |
| `PUT /api/board` | whole board, validated |
| `POST /api/cards` | |
| `PATCH /api/cards/{id}` | |
| `DELETE /api/cards/{id}` | |
| `POST /api/cards/{id}/move` | `column_id`, optional `position` |
| `PATCH /api/columns/{id}` | |
| `POST /api/chat` | `message`, optional `history` of `{role, content}`; returns `{message, board, applied, skipped}` |

- Errors: 404 for unknown ids, 422 for invalid input, 502 when the AI fails.
- A board is validated again before it is saved.
- **Chat flow:** ask the model, apply its operations one by one to a copy of the board (invalid ones are skipped), save, return the result.

### `ai.py`

OpenRouter via the `openai` SDK.

- `complete(messages, response_format)` is the **only function that touches the network**. Hardcoded `MODEL`, 60 s timeout, no retries. Every failure becomes `AIError`, including OpenRouter's 200-with-error body.
- `chat(board, history, message)` sends the system prompt, board JSON, history and message with a JSON-schema `response_format`. It returns a validated `Reply`: a `message` plus a list of `operations` (`create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`).
- `ask(prompt)` is a plain one-shot call.
- **`AI_STUB` mode** (offline, used by Playwright): `complete` is replaced by `stub_complete`.
  - `STUB:{json}` in the last message is returned as the reply.
  - A message containing "fail" raises `AIError`.
  - Anything else gets a plain reply.

## Tests (`tests/`)

| File | Covers |
|------|--------|
| `conftest.py` | Fixtures: `client` (signed out), `auth_client` (signed in), `make_client` (new app on the same temp DB, to simulate a restart) |
| `test_board.py` | Board rules and operations |
| `test_db.py` | Database behaviour |
| `test_api.py` | Routes and integration flows |
| `test_auth.py` | Login/logout, bad credentials, missing fields, tampered cookie, per-client sessions |
| `test_main.py` | Health and static routes (using a temp static dir) |
| `test_chat.py` | Chat route with only `ai.complete` mocked: every operation type, ordering, skipped operations, prompt contents, history, malformed output, errors, 401. Also `complete()` with a fake SDK client. |
| `test_ai.py` | Marker `live`, skipped without a key, no mocks: 2+2, create/move/question through `ai.chat`, and a full `/api/chat` run against the stored board |
| `test_docker.py` | Marker `docker`: builds the image, runs the container, hits `/` and `/api/health`, logs in, reads and changes the board, checks it survives a container restart (1 to 2 minutes; it builds the frontend) |
