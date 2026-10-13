# Scripts

Start and stop the app in Docker. Run from anywhere; they `cd` to the project root. The start scripts need `.env` in the project root.

- `start.sh` / `stop.sh` - Mac and Linux
- `start.ps1` / `stop.ps1` - Windows

Start builds the `pm-app` image and runs container `pm-app` on http://localhost:8000. Stop removes the container.

The container mounts the Docker volume `pm-data` at `/app/backend/data`, so the SQLite database survives stop and start. Reset the board with `docker volume rm pm-data` (after stop).
