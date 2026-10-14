#!/usr/bin/env bash
# Build and start the app in Docker (Mac and Linux). Serves http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t pm-app .
docker rm -f pm-app >/dev/null 2>&1 || true
docker run -d --name pm-app -p 127.0.0.1:8000:8000 -v pm-data:/app/backend/data --env-file .env pm-app
echo "Running at http://localhost:8000 (data kept in Docker volume pm-data; reset with: docker volume rm pm-data)"
