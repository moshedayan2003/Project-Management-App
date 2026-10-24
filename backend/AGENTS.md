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

Dependencies point one way: `routes` use `deps` and `services`, `services` use `models`, `models` use nothing in the app. `db.py` uses `models` and `services/passwords.py` (to seed the demo user).

```
main.py                create_app(): middleware, 404 and 422 handlers, /api/health, routers, static site
config.py              paths and env settings
db.py                  SQLite storage: users, boards, the version 1 upgrade
deps.py                request dependencies: current_user / CurrentUser, UserBoard
models/board.py        Board, Column, Card, Title, Label, Priority, COLUMN_IDS, empty_board, default_board
services/board_ops.py  pure card operations, NotFoundError
services/passwords.py  scrypt hash_password / verify_password
services/ai.py         OpenRouter call, operation schema, prompt, stub
routes/auth.py         /api/register, /api/login, /api/logout, /api/me (+ password, delete)
routes/boards.py       /api/boards: list, create, rename, delete
routes/board.py        /api/boards/{id}: read and replace the board, cards, columns
routes/chat.py         /api/boards/{id}/chat
```

### `main.py`

- `create_app(static_dir, db_path)` initialises the database, adds the session middleware, maps `NotFoundError` to 404 and a pydantic `ValidationError` raised while changing a board (for example an explicit null card title) to 422, adds `GET /api/health` (`{"status":"ok"}`), includes the routers, and serves `static_dir` at `/`.
- The module-level `app` uses `config.STATIC_DIR` and `config.DB_PATH`.

### `models/board.py`

- Pydantic `Board`, `Column` and `Card` models.
- A card has `id`, `title`, `details`, `priority` (`low`/`medium`/`high` or null), `due_date` (date or null) and `labels` (1 to 24 characters each). The last three default, so boards saved before they existed still load.
- Validation rules: the 5 fixed column ids in order, every card in exactly one column, card map keys equal card ids, no blank titles.
- `empty_board()` (the five columns, no cards; new boards) and `default_board()` (the demo board seeded for user `user`). `frontend/src/test/fixtures.ts` holds a copy of the demo board; keep them in sync.

### `services/board_ops.py`

- Pure operations on a `Board`: `create_card(board, column_id, title, **fields)`, `update_card(board, card_id, **changes)` (only the given fields change), `move_card` (position clamped to the column), `delete_card`, `rename_column`.
- Each mutates and returns the board. Callers validate and save it.
- Unknown ids raise `NotFoundError` (404). Both the REST routes and the chat route use these.

### `db.py`

SQLite via stdlib `sqlite3`. Connections are always closed (`_connect`). See `docs/DATABASE.md`.

- `init_db` creates the file and tables, upgrades a version 1 database in one transaction, and makes sure the demo user `user` / `password` exists (with one demo board if it was missing).
- Users: `get_user`, `get_user_by_id`, `create_user` (None if the name is taken), `set_password`, `delete_user` (cascades to boards). `User` is a dataclass `(id, username, password_hash)`.
- Boards: `list_boards`, `get_board_summary`, `create_board`, `get_board`, `save_board`, `rename_board`, `delete_board`. Every one takes the user id, so a user can never reach another user's board.

### `services/passwords.py`

scrypt from the standard library. A hash stores its own work factor (`COST`, 2^14) and salt; the tests lower `COST` for speed (`conftest.fast_password_hashing`).

### `deps.py`

- `current_user`: the signed-in `db.User` from the session's `user_id`, or 401 (also when the account has been deleted). `CurrentUser` is the annotated dependency.
- `UserBoard`: one of the signed-in user's boards, from the `board_id` path parameter.
  - `load()` reads it; a missing board or another user's board raises `NotFoundError` (404).
  - `update(change)` loads, changes, re-validates and saves it under one lock, so overlapping requests cannot lose writes. **Every write goes through `update()`**; never call `db.save_board` from a route, and never hold the lock during the AI call.

### `routes/auth.py`

Sessions are Starlette `SessionMiddleware` signed cookies (HttpOnly, SameSite=Lax) holding `user_id`. Signing in or registering clears any previous session first.

| Route | Body | Result |
|-------|------|--------|
| `POST /api/register` | `username` (`^[a-z0-9_-]{3,32}$`), `password` (8 to 128) | 201 `{id, username}` and signed in, with one empty board "My board". 409 if taken, 422 if invalid. |
| `POST /api/login` | `username`, `password` | `{id, username}`. 401 on bad credentials, 422 on missing fields. |
| `POST /api/logout` | | 204 |
| `GET /api/me` | | `{id, username}`, 401 without a session |
| `POST /api/me/password` | `current_password`, `new_password` | 204; 403 if the current password is wrong |
| `DELETE /api/me` | `password` | 204, deletes the user and their boards and signs out; 403 if the password is wrong |

### `routes/boards.py`, `routes/board.py` and `routes/chat.py`

Every route needs a session and only sees the signed-in user's boards; anyone else's board id is a 404.

| Route | Body / notes |
|-------|--------------|
| `GET /api/boards` | `[{id, name, created_at, updated_at, card_count}]`, oldest first |
| `POST /api/boards` | `name` (1 to 60, trimmed); 201 with the summary; the board starts empty |
| `PATCH /api/boards/{id}` | `name`; returns the summary |
| `DELETE /api/boards/{id}` | 204. The last board can be deleted too. |
| `GET /api/boards/{id}` | the board JSON |
| `PUT /api/boards/{id}` | whole board, validated |
| `POST /api/boards/{id}/cards` | `column_id`, `title`, optional `details`, `priority`, `due_date`, `labels`; 201 |
| `PATCH /api/boards/{id}/cards/{card_id}` | any of `title`, `details`, `priority`, `due_date`, `labels`; only sent fields change; null clears `priority` or `due_date` |
| `DELETE /api/boards/{id}/cards/{card_id}` | |
| `POST /api/boards/{id}/cards/{card_id}/move` | `column_id`, optional `position` |
| `PATCH /api/boards/{id}/columns/{column_id}` | `title` |
| `POST /api/boards/{id}/chat` | `message`, optional `history` of `{role, content}`; returns `{message, board, applied, skipped}` |

- Every route under `/api/boards/{id}` that changes the board returns the full updated board.
- Errors: 404 for unknown ids, 422 for invalid input, 502 when the AI fails.
- **Chat flow:** ask the model with no lock held. Then, inside `update()`, apply its operations one by one to a copy of the current board (invalid ones are skipped), save, and return the result. Changes the user made while the model was thinking are kept. In `update_card` the model sends null for fields it leaves alone, so nulls are dropped (the AI cannot clear a field).

### `services/ai.py`

OpenRouter via the `openai` SDK.

- `complete(messages, response_format)` is the **only function that touches the network**. Hardcoded `MODEL`, 60 s timeout. Every failure becomes `AIError`, including a missing key and OpenRouter's 200-with-error body.
- **Retries:** only when OpenRouter reports the provider overloaded (code 503 in a 200 body), waiting `OVERLOAD_RETRY_DELAYS` (1 s, then 2 s) before up to two retries. Everything else fails at once, including the 429 daily limit.
- **Free-tier quota:** without OpenRouter credits, free models allow 50 requests per day, reset at 00:00 UTC. Retries and live tests count against it, so run live tests sparingly.
- `chat(board, history, message)` sends the system prompt (with today's date, so the model can set due dates), board JSON, history and message with a JSON-schema `response_format`. It returns a validated `Reply`: a `message` plus a list of `operations` (`create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`). Card operations include `priority`, `due_date` and `labels`.
- `ask(prompt)` is a plain one-shot call.
- **`AI_STUB` mode** (offline, used by Playwright): `complete` is replaced by `stub_complete`.
  - `STUB:{json}` in the last message is returned as the reply.
  - A message containing "fail" raises `AIError`.
  - Anything else gets a plain reply.

## Tests (`tests/`)

Tests mock only `app.services.ai.complete` and use a real temporary SQLite file.

| File | Covers |
|------|--------|
| `conftest.py` | Fixtures: `client` (signed out), `auth_client` (signed in as the demo user), `board_url` (the demo user's board), `make_client` (new app on the same temp DB, to simulate a restart), `login()`; cheap password hashing for every test |
| `test_board.py` | Board rules and operations, new card fields, boards saved before those fields |
| `test_db.py` | Database behaviour: seeding, users, several boards, scoping by owner, cascade delete, the version 1 upgrade and its rollback on failure |
| `test_api.py` | Card and column routes, card fields, 401 for every route, integration flows, overlapping writes |
| `test_boards.py` | Board list routes: create, rename, delete, validation, independence of boards, persistence across restart |
| `test_auth.py` | Login/logout, register, password change, account deletion, tampered cookie, per-client sessions, users cannot reach each other's boards |
| `test_main.py` | Health and static routes (using a temp static dir) |
| `test_chat.py` | Chat route with only `ai.complete` mocked: every operation type and the card fields, ordering, skipped operations, the right board, changes made while the AI is thinking, prompt contents (board, history, today's date), malformed output, errors, missing key, 401, 404. Also `complete()` with a fake SDK client. |
| `test_ai.py` | Marker `live`, skipped without a key, no mocks: 2+2, create/move/question through `ai.chat`, and a full `/api/boards/{id}/chat` run against the stored board |
| `test_docker.py` | Marker `docker`: builds the image, runs the container, hits `/` and `/api/health`, logs in, reads and changes a board, creates a second one, checks both survive a container restart (1 to 2 minutes; it builds the frontend) |
