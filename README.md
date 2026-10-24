# Project Management App

Kanban project boards with user accounts, several boards per user, card priorities, due dates and labels, search, and an AI chat sidebar that can create, edit and move cards.

Create an account on the sign-in page, or use the demo account `user` / `password`.

## Run

1. Put `OPENROUTER_API_KEY=...` in `.env` in the project root.
2. Start the app:

   | OS          | Start              | Stop              |
   |-------------|--------------------|-------------------|
   | Mac / Linux | `scripts/start.sh`  | `scripts/stop.sh`  |
   | Windows     | `scripts/start.ps1` | `scripts/stop.ps1` |

3. Open http://localhost:8000.

Data is kept in the Docker volume `pm-data`. Reset it with `docker volume rm pm-data`.

## Test

```bash
# from backend/
uv run pytest                    # unit + integration
uv run pytest -m live --no-cov   # real OpenRouter calls

# from frontend/
npm run test:unit
npm run test:e2e
```

## More

- [docs/PLAN.md](docs/PLAN.md) - decisions and build history
- [docs/DATABASE.md](docs/DATABASE.md) - data model
- `AGENTS.md` files in each folder - code layout and details
