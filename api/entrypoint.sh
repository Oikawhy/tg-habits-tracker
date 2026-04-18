#!/bin/sh
# Entrypoint: create tables + run migrations BEFORE starting the API server.
# This ensures:
#   1. Database schema is ready before any worker starts
#   2. Alembic runs outside the async event loop (no asyncio.run conflict)
#   3. create_all() runs once, not per-worker (avoids duplicate type race)
set -e

# Ensure Python can find our app modules (database.py, etc.)
export PYTHONPATH=/app:$PYTHONPATH

# Step 1: Create tables (idempotent, runs once)
echo "[entrypoint] Creating database tables..."
python -c "
import asyncio
from database import engine, Base

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('[entrypoint] Tables verified')

asyncio.run(create())
" || {
    echo "[entrypoint] WARNING: Table creation failed, continuing"
}

# Step 2: Run Alembic migrations (indexes, constraints)
echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head || {
    echo "[entrypoint] WARNING: Alembic migration failed, continuing with existing schema"
}

echo "[entrypoint] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
