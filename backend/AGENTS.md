# Backend

FastAPI app managed with uv (`pyproject.toml`). Python 3.12+. Entry point: `app.main:app`.

## Commands (run from `backend/`)

| Command | What it does |
|---------|--------------|
| `uv run pytest` | Unit + integration tests with a coverage report (target about 80%, not enforced). Excludes `live` and `docker`. |
| `uv run pytest -m live --no-cov` | Real OpenRouter calls. Slow: the free model can take about 40 s. |
| `uv run pytest -m docker --no-cov` | Builds and runs the Docker image (1 to 2 minutes). |
| `uv run uvicorn app.main:app --reload` | Run locally on port 8000 (set `STATIC_DIR` first, see below). |

## Environment

All settings except the AI ones are read once, in `app/config.py`.

| Variable | Used by | Default |
|----------|---------|---------|
| `STATIC_DIR` | `config.py` | `backend/static` (Docker copies the Next.js export here; local runs use `../frontend/out`). Importing `app.main` fails if the folder does not exist. |
| `DB_PATH` | `config.py` | `backend/data/pm.db` (git-ignored) |
| `SESSION_SECRET` | `config.py` | a dev-only default |
| `OPENROUTER_API_KEY` | `services/ai.py` | read at call time from the environment; `services/ai.py` loads the project-root `.env` |
| `AI_STUB` | `services/ai.py` | unset; when set, an offline stub replaces the model (see below) |

## Layout (`app/`)

Dependencies point one way: `routes` use `deps` and `services`, `services` use `models`, `models` use nothing in the app.

```
main.py              create_app(): middleware, 404 handler, /api/health, routers, static site
config.py            paths and env settings
db.py                SQLite storage
deps.py              request dependencies: current_user, UserBoard
models/board.py      Board, Column, Card, Title, COLUMN_IDS, default_board
services/board_ops.py  pure card operations, NotFoundError
services/ai.py       OpenRouter call, operation schema, prompt, stub
routes/auth.py       /api/login, /api/logout, /api/me
routes/board.py      /api/board, /api/cards..., /api/columns/...
routes/chat.py       /api/chat
```

### `main.py`

- `create_app(static_dir, db_path)` initialises the database, adds the session middleware, maps `NotFoundError` to 404, adds `GET /api/health` (`{"status":"ok"}`), includes the three routers, and serves `static_dir` at `/`.
- The module-level `app` uses `config.STATIC_DIR` and `config.DB_PATH`.

### `models/board.py`

- Pydantic `Board`, `Column` and `Card` models.
- Validation rules: the 5 fixed column ids in order, every card in exactly one column, card map keys equal card ids, no blank titles.
- `default_board()`, the demo board seeded for user `user`. `frontend/src/test/fixtures.ts` holds a copy; keep them in sync.

### `services/board_ops.py`

- Pure operations on a `Board`: `create_card`, `update_card`, `move_card` (position clamped to the column), `delete_card`, `rename_column`.
- Each mutates and returns the board. Callers validate and save it.
- Unknown ids raise `NotFoundError` (404). Both the REST routes and the chat route use these.

### `db.py`

SQLite via stdlib `sqlite3`. Connections are always closed (`_connect`).

- `init_db` creates the file, tables, user `user` and the default board if missing.
- `get_user_id`, `get_board`, `save_board`.

### `deps.py`

- `current_user`: the signed-in username from the session, or 401.
- `UserBoard`: the signed-in user's board.
  - `load()` reads it.
  - `update(change)` loads, changes, re-validates and saves it under one lock, so overlapping requests cannot lose writes. **Every write goes through `update()`**; never call `db.save_board` from a route, and never hold the lock during the AI call.

### `routes/auth.py`

Hardcoded user `user` / `password`. Sessions are Starlette `SessionMiddleware` signed cookies (HttpOnly, SameSite=Lax).

| Route | Result |
|-------|--------|
| `POST /api/login` | JSON body. 401 on bad credentials, 422 on missing fields. |
| `POST /api/logout` | 204 |
| `GET /api/me` | 401 without a session |

### `routes/board.py` and `routes/chat.py`

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
- **Chat flow:** ask the model with no lock held. Then, inside `update()`, apply its operations one by one to a copy of the current board (invalid ones are skipped), save, and return the result. Changes the user made while the model was thinking are kept.

### `services/ai.py`

OpenRouter via the `openai` SDK.

- `complete(messages, response_format)` is the **only function that touches the network**. Hardcoded `MODEL`, 60 s timeout. Every failure becomes `AIError`, including a missing key and OpenRouter's 200-with-error body.
- **Retries:** only when OpenRouter reports the provider overloaded (code 503 in a 200 body), waiting `OVERLOAD_RETRY_DELAYS` (1 s, then 2 s) before up to two retries. Everything else fails at once, including the 429 daily limit.
- **Free-tier quota:** without OpenRouter credits, free models allow 50 requests per day, reset at 00:00 UTC. Retries and live tests count against it, so run live tests sparingly.
- `chat(board, history, message)` sends the system prompt, board JSON, history and message with a JSON-schema `response_format`. It returns a validated `Reply`: a `message` plus a list of `operations` (`create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`).
- `ask(prompt)` is a plain one-shot call.
- **`AI_STUB` mode** (offline, used by Playwright): `complete` is replaced by `stub_complete`.
  - `STUB:{json}` in the last message is returned as the reply.
  - A message containing "fail" raises `AIError`.
  - Anything else gets a plain reply.

## Tests (`tests/`)

Tests mock only `app.services.ai.complete` and use a real temporary SQLite file.

| File | Covers |
|------|--------|
| `conftest.py` | Fixtures: `client` (signed out), `auth_client` (signed in), `make_client` (new app on the same temp DB, to simulate a restart) |
| `test_board.py` | Board rules and operations |
| `test_db.py` | Database behaviour |
| `test_api.py` | Board routes, integration flows, overlapping writes |
| `test_auth.py` | Login/logout, bad credentials, missing fields, tampered cookie, per-client sessions |
| `test_main.py` | Health and static routes (using a temp static dir) |
| `test_chat.py` | Chat route with only `ai.complete` mocked: every operation type, ordering, skipped operations, changes made while the AI is thinking, prompt contents, history, malformed output, errors, missing key, 401. Also `complete()` with a fake SDK client. |
| `test_ai.py` | Marker `live`, skipped without a key, no mocks: 2+2, create/move/question through `ai.chat`, and a full `/api/chat` run against the stored board |
| `test_docker.py` | Marker `docker`: builds the image, runs the container, hits `/` and `/api/health`, logs in, reads and changes the board, checks it survives a container restart (1 to 2 minutes; it builds the frontend) |
