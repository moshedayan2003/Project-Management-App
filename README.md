# Project Management App

Kanban board with an AI chat sidebar. Sign in with `user` / `password`.

## Run

Put `OPENROUTER_API_KEY` in `.env` in the project root, then:

- Mac / Linux: `scripts/start.sh`, stop with `scripts/stop.sh`
- Windows: `scripts/start.ps1`, stop with `scripts/stop.ps1`

Open http://localhost:8000. Data is kept in the Docker volume `pm-data` (reset with `docker volume rm pm-data`).

## Test

- Backend (from `backend/`): `uv run pytest`; live AI tests: `uv run pytest -m live --no-cov`
- Frontend (from `frontend/`): `npm run test:unit`, `npm run test:e2e`

See `docs/PLAN.md` and the `AGENTS.md` files for details.
