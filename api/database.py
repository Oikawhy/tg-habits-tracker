"""
PlanHabits API — Database models and connection.
PostgreSQL with async SQLAlchemy.
"""

import os
from datetime import datetime, date, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Float,
    ForeignKey, Text, JSON, UniqueConstraint, BigInteger, Index
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://planhabits:planhabits_secret@localhost:5432/planhabits")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    """Telegram user."""
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)  # Telegram user ID
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    timezone = Column(String(50), default="UTC")
    reminder_enabled = Column(Boolean, default=True)
    reminder_minutes_before = Column(Integer, default=15)
    weekly_goal_percent = Column(Integer, default=100)  # Weekly goal: complete X% of habits
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    habits = relationship("Habit", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    """Habit category (Health, Learning, Work, etc.)."""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    icon = Column(String(10), nullable=True)  # Emoji
    sort_order = Column(Integer, default=0)

    # Relationships
    user = relationship("User", back_populates="categories")
    habits = relationship("Habit", back_populates="category")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_category_user_name"),
    )


class Habit(Base):
    """A trackable habit."""
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    color = Column(String(7), nullable=False, default="#6C5CE7")  # HEX color
    icon = Column(String(10), nullable=True)  # Emoji
    default_duration_min = Column(Integer, default=30)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="habits")
    category = relationship("Category", back_populates="habits")
    week_plans = relationship("WeekPlan", back_populates="habit", cascade="all, delete-orphan")
    day_entries = relationship("DayEntry", back_populates="habit", cascade="all, delete-orphan")
    streak = relationship("Streak", back_populates="habit", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_habit_user_archived", "user_id", "is_archived"),
    )


class WeekPlan(Base):
    """Assigns a habit to a specific day in a week with its own duration/time."""
    __tablename__ = "week_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    week_key = Column(String(10), nullable=False)  # e.g. "2026-W16"
    day_of_week = Column(Integer, nullable=False)  # 1=Mon, 2=Tue, ..., 7=Sun
    planned_minutes = Column(Integer, default=30)
    time_slot = Column(String(20), nullable=True)  # e.g. "09:00"

    # Relationships
    habit = relationship("Habit", back_populates="week_plans")

    __table_args__ = (
        # Include time_slot to allow same habit at different times on the same day
        UniqueConstraint("user_id", "habit_id", "week_key", "day_of_week", "time_slot", name="uq_weekplan_user_habit_week_day_slot"),
        Index("ix_weekplan_user_week_day", "user_id", "week_key", "day_of_week"),
    )


class DayEntry(Base):
    """A single habit entry for a specific day."""
    __tablename__ = "day_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    entry_date = Column(Date, nullable=False)
    planned_minutes = Column(Integer, default=30)
    actual_minutes = Column(Integer, nullable=True)
    time_slot = Column(String(20), nullable=True)  # e.g. "09:00"
    status = Column(String(10), default="undone")  # done | undone | skipped
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    habit = relationship("Habit", back_populates="day_entries")

    __table_args__ = (
        # Include time_slot to allow same habit at different times on the same day
        UniqueConstraint("user_id", "habit_id", "entry_date", "time_slot", name="uq_dayentry_user_habit_date_slot"),
        Index("ix_dayentry_user_date", "user_id", "entry_date"),
        Index("ix_dayentry_user_habit_date", "user_id", "habit_id", "entry_date"),
    )


class Streak(Base):
    """Streak tracking per habit."""
    __tablename__ = "streaks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    current_streak = Column(Integer, default=0)
    best_streak = Column(Integer, default=0)
    last_completed_date = Column(Date, nullable=True)
    freeze_available = Column(Boolean, default=True)  # 1 freeze per week
    freeze_used_week = Column(String(10), nullable=True)  # week_key when freeze was used

    # Relationships
    habit = relationship("Habit", back_populates="streak")

    __table_args__ = (
        UniqueConstraint("user_id", "habit_id", name="uq_streak_user_habit"),
    )


async def init_db():
    """Create tables on startup.
    
    Primary migration path: entrypoint.sh runs 'alembic upgrade head' BEFORE uvicorn.
    This function only runs create_all() as a safety net for fresh databases.
    
    For dev/test, set RUN_MIGRATIONS_ON_STARTUP=1 to also run Alembic here
    (uses asyncio.to_thread to avoid event loop conflict).
    """
    import logging
    import os
    logger = logging.getLogger("planhabits.db")

    # Step 1: Create any missing tables (safe, idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified")

    # Step 2 (optional): Run Alembic in a thread if explicitly requested
    if os.getenv("RUN_MIGRATIONS_ON_STARTUP", "").strip() in ("1", "true", "yes"):
        try:
            import asyncio
            from alembic.config import Config
            from alembic import command

            def _run_alembic():
                alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
                sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2") if "+asyncpg" in DATABASE_URL else DATABASE_URL
                alembic_cfg.set_main_option("sqlalchemy.url", sync_url)
                command.upgrade(alembic_cfg, "head")

            await asyncio.to_thread(_run_alembic)
            logger.info("Alembic migrations applied (via to_thread)")
        except ImportError:
            logger.warning("Alembic not available — skipping migrations")
        except Exception as e:
            logger.warning(f"Alembic migration failed: {e}")


async def get_session() -> AsyncSession:
    """Get a database session."""
    async with async_session() as session:
        yield session
