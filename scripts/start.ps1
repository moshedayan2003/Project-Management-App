# Build and start the app in Docker (Windows). Serves http://localhost:8000
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker build -t pm-app .
docker rm -f pm-app 2>$null | Out-Null
docker run -d --name pm-app -p 127.0.0.1:8000:8000 -v pm-data:/app/backend/data --env-file .env pm-app
Write-Host "Running at http://localhost:8000 (data kept in Docker volume pm-data; reset with: docker volume rm pm-data)"
