"""
Alembic environment — async migration runner for PlanHabits.

When run from entrypoint.sh (CLI): asyncio.run() works fine — no event loop conflict.
When run from init_db() via asyncio.to_thread(): also works — separate thread.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# Import our models so Alembic can detect them
from database import Base

# Alembic Config object
config = context.config

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Get database URL — prefer env var, fall back to alembic.ini
target_url = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url"))

# Model metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL without connecting."""
    # Offline mode needs a sync-compatible URL for SQL generation
    url = target_url.replace("+asyncpg", "+psycopg2") if "+asyncpg" in target_url else target_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to DB via async engine."""
    connectable = create_async_engine(target_url)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
