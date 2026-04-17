"""
PlanHabits API — Habit service (business logic).
"""

from datetime import datetime
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import Habit, Streak, Category


async def get_habits(session: AsyncSession, user_id: int, include_archived: bool = False):
    """Get all habits for a user."""
    query = select(Habit).where(Habit.user_id == user_id).options(
        selectinload(Habit.category)
    ).order_by(Habit.created_at)

    if not include_archived:
        query = query.where(Habit.is_archived == False)

    result = await session.execute(query)
    return result.scalars().all()


async def get_habit(session: AsyncSession, user_id: int, habit_id: int):
    """Get a single habit."""
    result = await session.execute(
        select(Habit)
        .where(Habit.id == habit_id, Habit.user_id == user_id)
        .options(selectinload(Habit.category))
    )
    return result.scalar_one_or_none()


async def create_habit(session: AsyncSession, user_id: int, data: dict):
    """Create a new habit and initialize its streak."""
    habit = Habit(user_id=user_id, **data)
    session.add(habit)
    await session.flush()

    # Initialize streak record
    streak = Streak(
        user_id=user_id,
        habit_id=habit.id,
        current_streak=0,
        best_streak=0,
        freeze_available=True
    )
    session.add(streak)
    await session.commit()
    await session.refresh(habit, attribute_names=["category"])
    return habit


async def update_habit(session: AsyncSession, user_id: int, habit_id: int, data: dict):
    """Update a habit."""
    # Remove None values
    update_data = {k: v for k, v in data.items() if v is not None}
    if not update_data:
        return await get_habit(session, user_id, habit_id)

    await session.execute(
        update(Habit)
        .where(Habit.id == habit_id, Habit.user_id == user_id)
        .values(**update_data)
    )
    await session.commit()
    return await get_habit(session, user_id, habit_id)


async def archive_habit(session: AsyncSession, user_id: int, habit_id: int):
    """Soft-delete (archive) a habit."""
    await session.execute(
        update(Habit)
        .where(Habit.id == habit_id, Habit.user_id == user_id)
        .values(is_archived=True)
    )
    await session.commit()


# ─── Categories ─────────────────────────────────────────────────────────────────

async def get_categories(session: AsyncSession, user_id: int):
    """Get all categories for a user."""
    result = await session.execute(
        select(Category)
        .where(Category.user_id == user_id)
        .order_by(Category.sort_order, Category.name)
    )
    return result.scalars().all()


async def create_category(session: AsyncSession, user_id: int, data: dict):
    """Create a new category."""
    category = Category(user_id=user_id, **data)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


async def update_category(session: AsyncSession, user_id: int, category_id: int, data: dict):
    """Update a category."""
    update_data = {k: v for k, v in data.items() if v is not None}
    if not update_data:
        return None

    await session.execute(
        update(Category)
        .where(Category.id == category_id, Category.user_id == user_id)
        .values(**update_data)
    )
    await session.commit()

    result = await session.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_category(session: AsyncSession, user_id: int, category_id: int, delete_habits: bool = False):
    """Delete a category. Optionally delete or uncategorize its habits."""
    result = await session.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    category = result.scalar_one_or_none()
    if not category:
        return

    if delete_habits:
        # Delete all habits in this category
        habits_result = await session.execute(
            select(Habit).where(Habit.user_id == user_id, Habit.category_id == category_id)
        )
        for habit in habits_result.scalars().all():
            await session.delete(habit)
    else:
        # Uncategorize: set category_id to NULL
        await session.execute(
            update(Habit)
            .where(Habit.user_id == user_id, Habit.category_id == category_id)
            .values(category_id=None)
        )

    await session.delete(category)
    await session.commit()
