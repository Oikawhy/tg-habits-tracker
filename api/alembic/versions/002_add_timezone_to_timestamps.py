"""002: Add timezone to timestamp columns

Change TIMESTAMP WITHOUT TIME ZONE → TIMESTAMP WITH TIME ZONE
for: users.created_at, habits.created_at, day_entries.completed_at
"""

from alembic import op
import sqlalchemy as sa

revision = '002_add_timezone_to_timestamps'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER COLUMN to TIMESTAMP WITH TIME ZONE
    # PostgreSQL handles this conversion automatically
    op.alter_column('users', 'created_at',
                     type_=sa.DateTime(timezone=True),
                     existing_type=sa.DateTime(),
                     existing_nullable=True)
    
    op.alter_column('habits', 'created_at',
                     type_=sa.DateTime(timezone=True),
                     existing_type=sa.DateTime(),
                     existing_nullable=True)
    
    op.alter_column('day_entries', 'completed_at',
                     type_=sa.DateTime(timezone=True),
                     existing_type=sa.DateTime(),
                     existing_nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'created_at',
                     type_=sa.DateTime(),
                     existing_type=sa.DateTime(timezone=True),
                     existing_nullable=True)
    
    op.alter_column('habits', 'created_at',
                     type_=sa.DateTime(),
                     existing_type=sa.DateTime(timezone=True),
                     existing_nullable=True)
    
    op.alter_column('day_entries', 'completed_at',
                     type_=sa.DateTime(),
                     existing_type=sa.DateTime(timezone=True),
                     existing_nullable=True)
