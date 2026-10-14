# Plan

Check off items (`[x]`) as they are completed. Stop for user approval where a part says so. The user does all git commits.

## Status

| Part | Topic | Status |
|------|-------|--------|
| 1 | Plan | Done |
| 2 | Scaffolding | Done |
| 3 | Add in frontend | Done |
| 4 | Fake user sign in | Done |
| 5 | Database modeling | Done |
| 6 | Backend API | Done |
| 7 | Frontend + backend | Done |
| 8 | AI connectivity | Done |
| 9 | AI with Kanban context and Structured Outputs | Done |
| 10 | Chat sidebar UI | Done |
| - | Full test run after Part 10 | Done |

## Contents

- [Decisions](#decisions-agreed-with-user)
- [Design decisions made while building](#design-decisions-made-while-building)
- [Running things on this machine (Windows)](#running-things-on-this-machine-windows)
- [Testing strategy](#testing-strategy)
- [Target layout](#target-layout)
- Parts: [1](#part-1-plan) - [2](#part-2-scaffolding) - [3](#part-3-add-in-frontend) - [4](#part-4-fake-user-sign-in) - [5](#part-5-database-modeling) - [6](#part-6-backend-api) - [7](#part-7-frontend--backend) - [8](#part-8-ai-connectivity) - [9](#part-9-ai-with-kanban-context-and-structured-outputs) - [10](#part-10-chat-sidebar-ui)

---

## Decisions (agreed with user)

| Area | Decision |
|------|----------|
| Frontend | Next.js with `output: "export"`, built to static files and served by FastAPI at `/`. No Next server features. |
| Backend | FastAPI in `backend/`, managed with `uv`. Serves `/api/*` and the static site. |
| Auth | `POST /api/login` checks the hardcoded `user` / `password` and sets an HTTP-only signed session cookie (Starlette `SessionMiddleware`). `POST /api/logout` clears it. All board and chat routes return 401 without the cookie and scope data to the session user. |
| Database | SQLite file, created on startup if missing. Schema supports many users, but the MVP has one board per user, stored as one JSON document matching the frontend `BoardData` shape. |
| AI | OpenRouter via the `openai` Python SDK, model `nvidia/nemotron-3-ultra-550b-a55b:free` (as set in AGENTS.md), key `OPENROUTER_API_KEY` from `.env` in the project root. |
| AI output | Structured Outputs: a reply message and an optional list of operations (create, update, move, delete card; rename column). Columns cannot be added or removed. |
| Chat history | Lives in the browser only and is sent with each request. |
| Tests | Run against a locally run server (not the container). Docker is only for packaging and a final smoke check. |
| Running | Locally in Docker, with scripts in `scripts/` for Mac and Linux (`.sh`) and Windows (`.ps1`). |

## Design decisions made while building

Made during Parts 2 to 7.

- **Configuration by env var**
  - `STATIC_DIR`: where the built site is served from. Default `backend/static`, which Docker fills from the frontend build.
  - `DB_PATH`: default `backend/data/pm.db`, git-ignored.
  - `SESSION_SECRET`: cookie signing. A dev-only default is used if unset; acceptable for the local MVP.
  - `create_app(static_dir, db_path)` builds the app so tests can use temporary paths.
- **Docker:** two-stage `Dockerfile` (Node 22 builds the frontend, Python 3.12 with `uv` runs the backend). The start scripts mount the named volume `pm-data` at `/app/backend/data` so the database survives stop and start (user approved). Reset the board with `docker volume rm pm-data`.
- **Auth:** no separate login route; `/` shows the login form when `/api/me` returns 401. Sessions are SameSite=Lax HttpOnly signed cookies. `current_user` in `auth.py` is the dependency every board and chat route uses.
- **Board rules** (enforced in `board.py` on every save; invalid boards are never stored):
  - exactly the five fixed column ids, in order
  - every card in exactly one column
  - card map keys equal card ids
  - no blank titles (whitespace is trimmed)
- **Board API**
  - Every mutating route returns the full updated board.
  - Card ids are assigned by the server (`card-` plus 8 hex characters).
  - `POST /api/cards/{id}/move` takes `column_id` and an optional `position` (0-based, clamped; omitted means the end).
  - Unknown ids give 404, invalid input 422.
  - The operations in `board.py` are pure functions on a `Board`, reused by the AI in Part 9.
- **Default board:** the five columns and eight demo cards live in the backend (`board.default_board`) and are seeded for user `user` on first start. `frontend/src/test/fixtures.ts` holds a copy for tests; keep the two in step.
- **Frontend behaviour**
  - Edit, delete and drag are shown immediately and then saved. If saving fails, the UI shows an error and reloads the server's board.
  - Add card waits for the server (it assigns the id).
  - A column rename is saved when the input loses focus, not on each keystroke.
  - A 401 from any call returns the user to the login form.
- **Drag and drop:** collision detection is `pointerWithin` first, falling back to `closestCorners`, so a card lands in the column under the pointer (plain `closestCorners` failed for empty or small columns). Drag listeners are not attached while a card is being edited.
- **Test setup:** Playwright runs with one worker (all tests share the one user and board), uses a temp database, and resets the board to the demo board before each test. Restart persistence is checked in the Docker integration test and by hand on the container, not by Playwright.

## Running things on this machine (Windows)

Learned while building; use these to avoid rediscovering them.

### `uv` is not on PATH

It lives in `C:\Users\moshe\AppData\Roaming\Python\Python314\Scripts` (`pip install uv` put it there). Add it per session, or use `python -m uv`. `npm run test:e2e` needs the same PATH.

```powershell
# PowerShell
$env:Path += ";C:\Users\moshe\AppData\Roaming\Python\Python314\Scripts"
```

```bash
# Bash
export PATH="$PATH:/c/Users/moshe/AppData/Roaming/Python/Python314/Scripts"
```

### Commands

| Where | Command | Notes |
|-------|---------|-------|
| `backend/` | `uv run pytest` | About 4 s, 77 tests; excludes `live` and `docker` |
| `backend/` | `uv run pytest -m live --no-cov` | Real OpenRouter calls, 5 to 40 s each; needs the key in the project-root `.env` |
| `backend/` | `uv run pytest -m docker --no-cov` | Builds the image, 1 to 2 minutes |
| `frontend/` | `npm run test:unit` | |
| `frontend/` | `npm run test:e2e` | Builds the static site and starts uvicorn itself on port 3000 with a temp database; no manual server needed |

### Running the app

- **Locally, for manual checks:** `npm run build` in `frontend/`, then from `backend/` run `STATIC_DIR=../frontend/out uv run uvicorn app.main:app` (port 8000).
- **In Docker:** `scripts/start.ps1` builds the image and runs the container on port 8000 with `--env-file .env` and the `pm-data` volume; `scripts/stop.ps1` removes it. The `.sh` scripts are untested on this machine.
- **`.env`** is read from the project root by `app/ai.py` locally; in Docker the same values arrive through `--env-file`.
- Free-model calls are slow and may rate-limit, so keep live tests few and never put them in the default run.

## Testing strategy

Applies to every part. A part is not done until its tests pass and coverage has been reported (the target is a guide, not a gate).

| Kind | What it means here |
|------|--------------------|
| Coverage | About 80%, where sensible. Report backend (`pytest-cov`) and frontend (`@vitest/coverage-v8`) coverage, but do not add low-value tests to reach 80%. Missing it is fine when the uncovered code is trivial; note why in the part's results. No `--cov-fail-under` gate. |
| Unit | Pure logic and components in isolation. External services (OpenRouter, network) are always mocked. Each test uses its own temporary SQLite file. |
| Integration (backend) | FastAPI `TestClient` against the real app and a real temporary SQLite DB, with only the LLM mocked. Full flows: login, load board, mutate, reload, logout, and chat with operations applied to the stored board. |
| Integration (frontend + backend) | Playwright drives a real browser against the locally run server (static build served by FastAPI, real DB in a temp location, LLM stubbed by an env flag). Covers user journeys end to end, including persistence across reload, logout/login and a second browser session. Restart persistence is covered by the Docker integration test. |
| Live AI | A small separate set that calls OpenRouter for real, marked `live`, skipped when `OPENROUTER_API_KEY` is absent, excluded from the coverage target. Assertions tolerate wording (for example the answer contains "4"). |
| Regression | Every bug fixed gets a test that fails before the fix. |

- **Commands:** `uv run pytest` (unit + integration, with coverage), `uv run pytest -m live`, `npm run test:unit` (add `-- --coverage` for coverage), `npm run test:e2e` (builds the static site, then runs Playwright against uvicorn on port 3000; needs `uv` on PATH).
- **Reporting:** at the end of each part, record the coverage numbers and test counts in the part's checklist.

## Target layout

```
backend/     FastAPI app (app/main.py, auth.py, board.py, db.py, api.py, ai.py),
             pyproject.toml (uv), tests/, data/ (SQLite, git-ignored)
frontend/    Next.js app
scripts/     start/stop for Mac, Linux, Windows
docs/        PLAN.md, DATABASE.md, db-schema.json
Dockerfile   multi-stage: Node builds the frontend, Python runs the backend
             (volume pm-data holds the database)
.env         OPENROUTER_API_KEY (not committed)
```

---

## Part 1: Plan

- [x] Review AGENTS.md, existing frontend and docs
- [x] Write `frontend/AGENTS.md` describing the existing code
- [x] Enrich this plan with checklists, tests and success criteria
- [x] User reviews and approves this plan

**Success:** user approves the plan.

## Part 2: Scaffolding

- [x] `backend/pyproject.toml` with uv; deps: fastapi, uvicorn, python-dotenv, itsdangerous, openai; dev: pytest, pytest-cov, httpx; pytest configured with coverage reporting and `live` and `docker` markers
- [x] `backend/app/main.py`: FastAPI app, `GET /api/health` returning `{"status":"ok"}`, static mount at `/` (a placeholder hello world page in this part; replaced by the real site in Part 3)
- [x] Multi-stage `Dockerfile` (python stage using `uv`; the node build stage is added in Part 3), `.dockerignore`
- [x] Scripts in `scripts/`: `start.sh`, `stop.sh` (Mac and Linux, shared), `start.ps1`, `stop.ps1` (Windows). Build the image, run the container on port 8000 with `--env-file .env`, stop and remove it. (Part 6 added the `pm-data` volume mount.)
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`
- [x] Unit tests: pytest for `/api/health` and for `/` serving HTML
- [x] Integration test: build the image, start the container via the start script, hit `/` and `/api/health` over HTTP, stop it (run manually or as a marked `docker` test)

**Result**

- Tests: 2 unit tests plus 1 docker integration test pass; coverage 100%.
- Verified: start script, `/`, `/api/health` and stop script on Windows (the `.sh` scripts are untested here).

**Success:** running the start script then opening `http://localhost:8000/` shows the hello world page, and `/api/health` returns ok. The stop script removes the container. pytest passes.

## Part 3: Add in Frontend

- [x] Set `output: "export"` in `next.config.ts`; confirm `npm run build` produces `out/`
- [x] Dockerfile node stage builds the frontend; python stage copies `out/` into the static dir served at `/`
- [x] Add the missing card edit feature (click a card to edit title and details) since the requirements call for editable cards; add unit tests for it
- [x] Configure Vitest coverage reporting (no hard threshold; aim for about 80% where sensible)
- [x] Extend unit tests (Vitest): `kanban.ts` helpers (including edge cases: unknown ids, empty columns, same-position drop), column rename, add, edit, delete card, `NewCardForm` validation
- [x] Integration/e2e: Playwright against the locally run backend serving the static build (update `playwright.config.ts` webServer to start uvicorn), covering load, add, edit, delete, rename, drag within a column and across columns, and the empty-title guard
- [x] Update `frontend/AGENTS.md` if the structure changes

**Result**

- Tests: 16 Vitest tests (frontend coverage 90% statements, 87% branches; uncovered code is mainly drag handlers and the drag preview, covered by e2e). 8 Playwright e2e tests against uvicorn serving the static build. 3 backend tests (100%). Docker integration test passes.
- Verified: the container in a real browser shows 5 columns and 8 cards, editing a card works, no console errors or failed requests.
- Bug fixed: `useSortable({disabled})` set `aria-disabled` on the card, so the edit inputs were reported as disabled. Drag listeners are now simply not attached while editing.
- Note: the e2e suite later grew to 30 tests (Parts 4 and 7). Playwright starts uvicorn itself, so no manual server is needed.

**Success:** `/` serves the demo Kanban board from the container; `npm run test:unit` and `npm run test:e2e` pass; coverage is reported and reasonably high for `src/lib` and `src/components`.

## Part 4: Fake user sign in

- [x] Backend: `POST /api/login`, `POST /api/logout`, `GET /api/me`; signed session cookie; 401 on bad credentials
- [x] Frontend: login form shown when `/api/me` returns 401; board shown otherwise; Log out button in the header
- [x] Unit tests: backend (good login, bad login, missing fields, me, logout, tampered cookie rejected); Vitest for the login form (validation, error display, submit)
- [x] Integration tests: `TestClient` flow login -> me -> logout -> me (401); Playwright for the login form on first visit (no separate redirect: `/` itself shows the form), bad password error, login, reload stays signed in, logout, protected API returns 401 after logout

**Result**

- Tests: 11 backend auth tests plus 3 route tests (100% backend coverage). 23 Vitest tests (frontend 92% statements, 89% branches). 12 Playwright e2e tests (4 new auth tests; the board tests now sign in through the API first). The Docker integration test now also covers the auth flow.
- Verified with curl on the real container: 401 without cookie, bad login 401, good login 200 with an HttpOnly cookie, logout 204, 401 afterwards.
- Verified in a real browser: login form on first visit, error on bad password, board after login, still signed in after reload, back to the login form after logout.
- Note: the 401 console messages in the browser are the expected responses to the signed-out `/api/me` check and the bad password.

**Success:** first visit to `/` shows only the login form; `user` / `password` shows the board; logout returns to login; a reload while signed in stays signed in.

## Part 5: Database modeling

- [x] Propose schema in `docs/db-schema.json` and describe it in `docs/DATABASE.md`:
  - `users(id INTEGER PK, username TEXT UNIQUE, password_hash TEXT NULL)`; MVP seeds `user`
  - `boards(id INTEGER PK, user_id INTEGER UNIQUE FK, data TEXT NOT NULL JSON, updated_at TEXT)`; one board per user for now (drop `UNIQUE` later for multiple boards)
  - `data` holds `{ columns: [{id,title,cardIds}], cards: {id: {id,title,details}} }`
- [x] Note the trade-off: whole-board JSON is simple and matches the AI input/output; per-card tables would be needed only for querying or concurrent edits
- [x] User reviews and approves the schema

**Success:** user signs off on the schema document.

## Part 6: Backend API

- [x] `db.py`: create the SQLite file and tables if missing; seed user `user` and the default board (the demo board, now defined in the backend as `board.default_board`) on first use
- [x] Routes (all need a session): `GET /api/board`; `PUT /api/board` (replace whole board, validated); fine-grained routes (built, every one returns the full updated board): `POST /api/cards`, `PATCH /api/cards/{id}`, `DELETE /api/cards/{id}`, `POST /api/cards/{id}/move`, `PATCH /api/columns/{id}`
- [x] Pydantic models enforce the five fixed column ids, every card in exactly one column, no dangling ids
- [x] Shared board-operation functions (create, update, move, delete card; rename column), reused later by the AI
- [x] Unit tests with a temporary DB per test: DB created when missing, default board seeded, each operation, validation errors (422/404), 401 without session, data isolated per user (second user cannot see or change the first user's board)
- [x] Integration tests (`TestClient`, real SQLite): login, read board, apply a sequence of mutations, reopen the app on the same DB file and confirm state persisted; delete the DB file and confirm recreation
- [x] Report backend coverage (aim for about 80% where sensible)

**Result**

- Tests: 59 backend tests, 100% coverage. They cover board rules and operations, database creation and isolation, every route including 401/404/422 cases, and integration flows (changes survive logout/login and an app restart; the DB is recreated after the file is deleted). The Docker integration test also reads the board, changes a column, restarts the container and checks the change persisted.
- Verified with curl on the real container, including data surviving stop and start through the `pm-data` volume.
- Decisions: every mutating route returns the full updated board; card moves take `column_id` plus an optional `position`; the start scripts mount the `pm-data` Docker volume (user approved).
- Bug fixed: `with sqlite3.connect()` commits but does not close, which leaked connections and, on Windows, made deleting the DB file fail. `db._connect` now always closes.

**Success:** all backend tests pass; deleting the DB file and starting the server recreates it with the default board.

## Part 7: Frontend + Backend

- [x] Frontend `lib/api.ts` fetch client; board loaded from `GET /api/board` after login
- [x] Each user action (rename, add, edit, delete, move) calls the API; on failure show a small error and reload the board
- [x] Keep UI responsive: apply change locally, then persist
- [x] Unit tests: Vitest with mocked fetch covering loading state, success, API failure with error message and rollback/reload, and each action calling the right endpoint
- [x] Integration tests: Playwright against the real server: make each kind of change, reload, changes persist; logout and login again, changes persist; two browser contexts see the same board. (Server restart persistence: Docker integration test plus a manual browser check on the container.)
- [x] Report frontend and backend coverage (aim for about 80% where sensible)

**Result**

- Tests: 29 Vitest tests (frontend about 90% statements, 92% branches; uncovered code is the drag handler and drag preview, covered by e2e). 21 Playwright e2e tests against the real server (9 new persistence tests: add, edit, rename, delete, drag across columns, reorder within a column, logout/login, a second browser session, 401 without sign-in). Backend unchanged: 59 tests, 100%.
- Verified in the real container with a browser: made changes through the UI, removed the container, started it again, and all changes were still there.
- Decisions:
  - Add card waits for the server (it assigns the id) and shows the returned board.
  - Edit, delete and drag are shown immediately and then saved; on failure an error is shown and the server's board is reloaded.
  - A column rename is saved when the input loses focus, not on every keystroke.
  - A 401 sends the user back to the login form.
  - The Playwright run uses one worker and a temp database, and resets the board to the demo board before each test.
- Bug fixed after Part 7 (reported by the user): cards could not be dropped on some columns (for example Review, or back on Backlog).
  - Root cause, shown by computing dnd-kit's scores for a drop inside an empty Backlog column: `closestCorners` ranked a card in the neighbouring Discovery column (1141) ahead of the Backlog column under the pointer (1649), so the card went to the wrong column whenever the target column was empty or small.
  - Fix: collision detection now uses `pointerWithin` first and falls back to `closestCorners`.
  - Regression: `tests/drag-targets.spec.ts` (9 tests, 8 of which failed before the fix). All 30 e2e tests pass.

**Success:** a fully persistent Kanban board; all unit, backend and e2e tests pass.

## Part 8: AI connectivity

Decisions (agreed with user):

- The model name is a hardcoded constant in `ai.py` (not parsed from AGENTS.md).
- No temporary test route; a live pytest test proves connectivity.
- The key is read lazily from the project-root `.env` (or the container environment).
- 60 s timeout, no retries, errors surface as exceptions (Part 9 turns them into a clean error).
- No mocked client; tests go all the way to OpenRouter.
- The future chat endpoint is `POST /api/chat` (Part 9).

Checklist:

- [x] `ai.py`: OpenAI SDK client with `base_url=https://openrouter.ai/api/v1`, key `OPENROUTER_API_KEY`, hardcoded model `nvidia/nemotron-3-ultra-550b-a55b:free`
- [x] Live test (marker `live`, skipped without a key) asking "What is 2+2?" and asserting the answer contains "4"
- [x] Structured outputs and rate limits: not checked here; moved to the first item of Part 9

**Result**

- The live test passes against the real model (about 40 s for one short answer).
- Mock test and test route dropped by decision.

**Success:** a live call through OpenRouter returns an answer containing 4.

## Part 9: AI with Kanban context and Structured Outputs

- [x] First, check with a live call whether the free model supports structured outputs and note its rate limits and latency (about 40 s for a short answer in Part 8); if not, record it in docs and raise it with the user before building on it
- [x] Define the response schema: `{ message: string, operations: Operation[] }` where an operation is one of `create_card`, `update_card`, `move_card`, `delete_card`, `rename_column` (discriminated union with explicit fields)
- [x] `POST /api/chat` (requires a session via `current_user`, works on the signed-in user's board) takes `{ message, history }`; the server loads the user's board, sends system prompt + board JSON + history + question, parses the structured response
- [x] Apply operations with the Part 6 functions in `board.py` in order (they raise `NotFoundError` for unknown ids); skip and report invalid operations (unknown ids); save the board; return `{ message, board, applied }`
- [x] Prompt rules: columns are fixed; refer to cards by id; reply briefly
- [x] Unit tests (mocked LLM): each operation type, multiple operations in one reply, no-op reply, invalid operation ids, malformed or non-JSON model output, LLM timeout/error returning a clean error, history passed through, board JSON included in the prompt
- [x] Integration tests (`TestClient`, real SQLite, mocked LLM): chat request changes the stored board and a following `GET /api/board` reflects it; 401 without session; failed operations leave the board consistent
- [x] Live tests (marked `live`): a few (skipped without key) such as "add a card called X to Backlog" and "move card 1 to Done"

**Result**

- Tests: 17 mocked chat tests plus 5 live tests (the 4 in `test_ai.py`, plus one through the whole `/api/chat` route with the real model and real DB). Default run: 76 backend tests, 99% coverage (the one uncovered line is `ai.ask`, exercised by the live test).
- Only the network function `ai.complete` is mocked in the default tests; parsing, validation and applying operations are real.
- Model findings: structured outputs work on the free model (`response_format` json_schema; the discriminated-union schema from Pydantic was accepted). A reply takes roughly 5 to 20 s.
- Decisions:
  - Operations are applied one at a time on a copy of the board and validated, so an invalid one (unknown id, blank title) is skipped and reported in `skipped` while the rest still apply.
  - The response is `{message, board, applied, skipped}`.
  - Any AI failure or unparsable reply is a 502 with a message and leaves the board untouched. No retries.
  - The model sometimes says in `message` that it cannot do something while still returning the operation, so the prompt tells it to describe what it did.
- Bug fixed (found by the live tests): when the free upstream is overloaded, OpenRouter returns HTTP 200 with `choices: null` and an `error` body (503 "Service temporarily overloaded"), which crashed with a `TypeError`. `ai.complete` now raises `AIError` (regression test `test_complete_handles_openrouter_error_body`).
- Known flakiness: expect occasional overload errors from the free model, and occasional live-test failures because the model is non-deterministic (one move-card live run failed once and passed 3 times after; cause not identified).

**Success:** with a live key, asking the AI to create, edit, move or delete cards changes the stored board; a plain question leaves the board unchanged.

## Part 10: Chat sidebar UI

- [x] `ChatSidebar` component: message list, input, send button, loading state, error state; uses the project colour scheme; history kept in React state only
- [x] Layout: board on the left, collapsible sidebar on the right, responsive
- [x] On a response with applied operations, replace the board state with the returned board so the UI refreshes automatically (`KanbanBoard` owns the board state, so the sidebar needs a way to set it)
- [x] Unit tests: Vitest for the sidebar (send, empty input blocked, loading, render reply, error display, history accumulates, board refresh callback) with mocked fetch
- [x] Integration tests: Playwright with the LLM stubbed at the server (env flag) covering chats that add, edit, move, delete a card and rename a column with the board updating without reload, a plain question leaving the board unchanged, and an AI error showing in the sidebar; the optional live e2e was not added (live behaviour is covered by the backend live tests and a manual run in the container)
- [x] Report coverage for frontend and backend (aim for about 80% where sensible)
- [x] Final full run of all unit, backend and e2e tests; Docker smoke test via start script; update all AGENTS.md files and keep the README minimal

**Result**

- Tests: 39 Vitest tests (10 new for the sidebar; frontend 91% statements, 92% branches; `ChatSidebar` 98%). 39 Playwright e2e tests (9 new in `tests/chat.spec.ts`: add, edit, move, delete, rename column, persistence after reload, plain question, AI error, hide/show). Backend: 77 tests, 99% coverage (the uncovered line is `ai.ask`, covered by the live tests). Lint is clean.
- Verified: the Docker integration test passes, and the real container started with `scripts/start.ps1` (real key, no stub) answered a live `/api/chat` request by adding a card (removed afterwards). The `.sh` scripts remain untested here.
- Decisions:
  - **Stub:** the e2e server runs with `AI_STUB=1` (`ai.stub_complete`). A message `STUB:{json}` makes the stubbed model reply with that JSON, a message containing "fail" raises an AI error, anything else gets a plain reply.
  - **Placement:** the sidebar stays in view while scrolling: a sticky full-height column to the right of the board at `xl` (1280px) and wider, a floating bottom-right panel on narrower screens. The page wrapper must use `overflow-clip`; `overflow-hidden` silently breaks `position: sticky`.
  - **Hide / show:** open by default. Hide animates it away completely, leaving only a round AI button bottom-right that reopens it. The conversation is kept.
  - **Input:** an auto-growing textarea, up to 4 lines (108px), then it scrolls. Enter sends, Shift+Enter adds a new line.
  - **Board updates:** the board is replaced with the returned board only when operations were applied. Skipped operations are mentioned in the assistant's message.
  - **Room for the sidebar:** the header "Focus" box shows only at `2xl`, and a card's Edit and Remove buttons sit in a row that wraps below the text in narrow columns.
- Test fixes found on the way:
  - The chat log's `aria-label` ("Chat messages") also matched label lookups for "Message"; renamed to "Conversation".
  - `kanban.spec.ts` "does not add a card with a blank title" read its card count before the board had loaded and failed about 1 run in 8. It now waits for the board; 20 of 20 repeats pass.

**Success:** user can chat in the sidebar, the AI can create, edit, move and delete cards and rename columns, and the board updates without a reload. Everything runs in the Docker container started by the scripts, and all tests pass.

## Full test run after Part 10

- Results: backend 77 passed (99% coverage), live 5 passed, Docker 1 passed, Vitest 40 passed (Part 10 recorded 39), lint clean, Playwright 39 passed. The container started with `scripts/start.ps1` answered health, `/`, login and board requests and was stopped afterwards.
- Test fixed: `drag-targets.spec.ts` "dropping on an empty Review column at +450px" failed 5 of 5 runs. Root cause, measured: the columns start at y=340, so the drop point (y=790) was below the 720px default viewport; dnd-kit auto-scrolled the page by 510px, which left the pointer below the 852px Review column, so `pointerWithin` found nothing and the `closestCorners` fallback chose `card-7` in Done. The Backlog variant passed only because its column was 1104px tall. A real pointer cannot be off-screen, so the test was at fault, not the app. Fix: the spec runs with a 1280x1200 viewport. After the fix, 45 of 45 repeated runs pass; with collision detection temporarily set back to plain `closestCorners`, all 9 drag tests fail, so they still guard against the Part 7 bug.
