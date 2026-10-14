# Scripts

Start and stop the app in Docker.

| Script                  | Platform    |
|-------------------------|-------------|
| `start.sh` / `stop.sh`   | Mac, Linux  |
| `start.ps1` / `stop.ps1` | Windows     |

- Run them from anywhere; they `cd` to the project root first.
- **Start** needs `.env` in the project root. It builds the `pm-app` image and runs a container named `pm-app` on http://localhost:8000, published on `127.0.0.1` only (the login and default session secret are public, so the app must not be reachable from the network).
- **Stop** removes the container.

## Data

The container mounts the Docker volume `pm-data` at `/app/backend/data`, so the SQLite database survives stop and start.

To reset the board, stop the app, then run `docker volume rm pm-data`.
