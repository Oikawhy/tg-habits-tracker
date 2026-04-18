"""Initial schema with indexes and updated constraints.

Revision ID: 001_initial
Revises: None
Create Date: 2026-04-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """For existing databases, add indexes and update constraints.
    New databases get everything via create_all() + this migration stamps baseline.
    """
    # --- Add new indexes (safe: CREATE INDEX IF NOT EXISTS) ---
    op.create_index('ix_habit_user_archived', 'habits', ['user_id', 'is_archived'], if_not_exists=True)
    op.create_index('ix_weekplan_user_week_day', 'week_plans', ['user_id', 'week_key', 'day_of_week'], if_not_exists=True)
    op.create_index('ix_dayentry_user_date', 'day_entries', ['user_id', 'entry_date'], if_not_exists=True)
    op.create_index('ix_dayentry_user_habit_date', 'day_entries', ['user_id', 'habit_id', 'entry_date'], if_not_exists=True)

    # --- Update UniqueConstraints to include time_slot ---
    # Drop old constraints (may not exist on fresh DBs, so wrap in try/except)
    try:
        op.drop_constraint('uq_weekplan_user_habit_week_day', 'week_plans', type_='unique')
    except Exception:
        pass

    try:
        op.drop_constraint('uq_dayentry_user_habit_date', 'day_entries', type_='unique')
    except Exception:
        pass

    # Create new constraints including time_slot
    op.create_unique_constraint(
        'uq_weekplan_user_habit_week_day_slot',
        'week_plans',
        ['user_id', 'habit_id', 'week_key', 'day_of_week', 'time_slot']
    )
    op.create_unique_constraint(
        'uq_dayentry_user_habit_date_slot',
        'day_entries',
        ['user_id', 'habit_id', 'entry_date', 'time_slot']
    )


def downgrade() -> None:
    """Reverse: remove new indexes, restore old constraints."""
    op.drop_index('ix_habit_user_archived', 'habits')
    op.drop_index('ix_weekplan_user_week_day', 'week_plans')
    op.drop_index('ix_dayentry_user_date', 'day_entries')
    op.drop_index('ix_dayentry_user_habit_date', 'day_entries')

    try:
        op.drop_constraint('uq_weekplan_user_habit_week_day_slot', 'week_plans', type_='unique')
    except Exception:
        pass
    try:
        op.drop_constraint('uq_dayentry_user_habit_date_slot', 'day_entries', type_='unique')
    except Exception:
        pass

    op.create_unique_constraint(
        'uq_weekplan_user_habit_week_day',
        'week_plans',
        ['user_id', 'habit_id', 'week_key', 'day_of_week']
    )
    op.create_unique_constraint(
        'uq_dayentry_user_habit_date',
        'day_entries',
        ['user_id', 'habit_id', 'entry_date']
    )
