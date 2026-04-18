"""Initial schema with indexes and updated constraints.

Revision ID: 001_initial
Revises: None
Create Date: 2026-04-18

Uses raw SQL with existence checks to avoid PostgreSQL's
transaction-abort-on-DDL-error problem. Python try/except
does NOT reset a failed PostgreSQL transaction — all subsequent
commands in the same transaction would fail.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Helper: check if a constraint exists before DROP/CREATE
_CONSTRAINT_EXISTS = """
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = :name AND table_name = :table
"""


def _constraint_exists(conn, name: str, table: str) -> bool:
    """Check if a constraint exists in the current database."""
    from sqlalchemy import text
    result = conn.execute(text(_CONSTRAINT_EXISTS), {"name": name, "table": table})
    return result.fetchone() is not None


def upgrade() -> None:
    """Add indexes and update constraints.
    
    Safe for both fresh databases (post-create_all) and existing ones.
    Every operation checks existence first — no failing DDL, no aborted transactions.
    """
    conn = op.get_bind()
    from sqlalchemy import text

    # --- Indexes (IF NOT EXISTS is PostgreSQL-native, always safe) ---
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_habit_user_archived ON habits (user_id, is_archived)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_weekplan_user_week_day ON week_plans (user_id, week_key, day_of_week)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_dayentry_user_date ON day_entries (user_id, entry_date)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_dayentry_user_habit_date ON day_entries (user_id, habit_id, entry_date)"
    ))

    # --- Drop old constraints (only if they exist) ---
    if _constraint_exists(conn, 'uq_weekplan_user_habit_week_day', 'week_plans'):
        conn.execute(text(
            "ALTER TABLE week_plans DROP CONSTRAINT uq_weekplan_user_habit_week_day"
        ))

    if _constraint_exists(conn, 'uq_dayentry_user_habit_date', 'day_entries'):
        conn.execute(text(
            "ALTER TABLE day_entries DROP CONSTRAINT uq_dayentry_user_habit_date"
        ))

    # --- Create new constraints including time_slot (only if not already present) ---
    if not _constraint_exists(conn, 'uq_weekplan_user_habit_week_day_slot', 'week_plans'):
        conn.execute(text(
            "ALTER TABLE week_plans ADD CONSTRAINT uq_weekplan_user_habit_week_day_slot "
            "UNIQUE (user_id, habit_id, week_key, day_of_week, time_slot)"
        ))

    if not _constraint_exists(conn, 'uq_dayentry_user_habit_date_slot', 'day_entries'):
        conn.execute(text(
            "ALTER TABLE day_entries ADD CONSTRAINT uq_dayentry_user_habit_date_slot "
            "UNIQUE (user_id, habit_id, entry_date, time_slot)"
        ))


def downgrade() -> None:
    """Reverse: remove new indexes, restore old constraints."""
    conn = op.get_bind()
    from sqlalchemy import text

    conn.execute(text("DROP INDEX IF EXISTS ix_habit_user_archived"))
    conn.execute(text("DROP INDEX IF EXISTS ix_weekplan_user_week_day"))
    conn.execute(text("DROP INDEX IF EXISTS ix_dayentry_user_date"))
    conn.execute(text("DROP INDEX IF EXISTS ix_dayentry_user_habit_date"))

    if _constraint_exists(conn, 'uq_weekplan_user_habit_week_day_slot', 'week_plans'):
        conn.execute(text(
            "ALTER TABLE week_plans DROP CONSTRAINT uq_weekplan_user_habit_week_day_slot"
        ))
    if _constraint_exists(conn, 'uq_dayentry_user_habit_date_slot', 'day_entries'):
        conn.execute(text(
            "ALTER TABLE day_entries DROP CONSTRAINT uq_dayentry_user_habit_date_slot"
        ))

    if not _constraint_exists(conn, 'uq_weekplan_user_habit_week_day', 'week_plans'):
        conn.execute(text(
            "ALTER TABLE week_plans ADD CONSTRAINT uq_weekplan_user_habit_week_day "
            "UNIQUE (user_id, habit_id, week_key, day_of_week)"
        ))
    if not _constraint_exists(conn, 'uq_dayentry_user_habit_date', 'day_entries'):
        conn.execute(text(
            "ALTER TABLE day_entries ADD CONSTRAINT uq_dayentry_user_habit_date "
            "UNIQUE (user_id, habit_id, entry_date)"
        ))
