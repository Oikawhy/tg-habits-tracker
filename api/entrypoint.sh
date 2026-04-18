#!/bin/sh
# Entrypoint: run Alembic migrations BEFORE starting the API server.
# This ensures migrations run outside the async event loop.
set -e

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head || {
    echo "[entrypoint] WARNING: Alembic migration failed, continuing with existing schema"
}

echo "[entrypoint] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
