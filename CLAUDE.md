# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Before changing an area, read its detail file and update it when the structure changes: `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`, `docs/PLAN.md` (decisions, part checklist), `docs/DATABASE.md`.

## Architecture

- Next.js 16 static export (`output: "export"`, built to `frontend/out`) is served at `/` by FastAPI, which also serves `/api/*`. No Next server features (no API routes, no rewrites, no SSR).
- A board is one JSON document per user with exactly 5 fixed column ids (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`); only titles change. Every mutating route returns the full updated board. The server assigns card ids.
- Card operations are pure functions in `backend/app/board.py`, shared by the REST routes and `POST /api/chat`.
- `POST /api/chat` applies the model's operations one by one to a copy of the board, skipping invalid ones; AI failure returns 502. Chat history lives in the browser only.
- `ai.complete` is the only function that touches the network. It is the only thing tests may mock.

## Environment

- `OPENROUTER_API_KEY` in the root `.env` (git-ignored). `ai.py` loads that file itself.
- `STATIC_DIR` defaults to `backend/static`, which only exists in Docker. Importing `app.main` locally fails unless it is set (e.g. `STATIC_DIR=../frontend/out`).
- Optional: `DB_PATH` (default `backend/data/pm.db`), `SESSION_SECRET`, `AI_STUB` (any value: offline stub model; `STUB:{json}` in the message becomes the reply, a message containing "fail" raises).

## Commands

- Docker: `scripts/start.ps1` / `scripts/start.sh` (port 8000, volume `pm-data`), stop with `scripts/stop.*`. Reset data: `docker volume rm pm-data`.
- Local: `npm run build` in `frontend/`, then in `backend/`: `STATIC_DIR=../frontend/out uv run uvicorn app.main:app`.
- Backend (`backend/`): `uv run pytest` excludes the `live` and `docker` markers; run those with `uv run pytest -m live --no-cov` / `-m docker --no-cov`.
- Frontend (`frontend/`): `npm run test:unit`, `npm run test:e2e` (builds, then Playwright starts uvicorn on port 3000 with `AI_STUB=1` and a temp DB), `npm run test:all`, `npm run lint`.

## Testing rules

- Every bug fix gets a regression test that fails before the fix.
- Mock only `ai.complete`. Use a real temporary SQLite file per test.
- Coverage target about 80% where sensible, not a gate. No low-value tests just to reach it.
- Keep live AI tests few and out of the default run: the free model is slow, rate-limited, and sometimes returns HTTP 200 with an error body.

## Gotchas

- Windows: `uv` is not on PATH. Add `C:\Users\moshe\AppData\Roaming\Python\Python314\Scripts` per session or use `python -m uv`. `npm run test:e2e` needs `uv` on PATH.
- `frontend/src/test/fixtures.ts` copies the backend `board.default_board`; keep them in sync.
- The `KanbanBoard` page wrapper must use `overflow-clip`, not `overflow-hidden`, or the sticky chat sidebar breaks.
- Drag collision detection is `pointerWithin` falling back to `closestCorners`; plain `closestCorners` drops cards in the wrong column when the target is empty.
- Playwright tests share one user and board: keep `workers: 1`.
- The frontend build fetches Google fonts, so it needs network.
- Always close sqlite connections (`db._connect` does); on Windows an open connection blocks deleting the DB file.

## Workflow

- Never commit or push. The user does all git operations.
- Follow the part workflow in `docs/PLAN.md`: tick `[x]` items as they complete, record test counts and coverage in the part's result, and stop for user approval where a part says so.
