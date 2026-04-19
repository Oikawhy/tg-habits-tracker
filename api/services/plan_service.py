"""
PlanHabits API — Plan service (week planning business logic).
"""

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import WeekPlan, Habit


async def get_week_plans(session: AsyncSession, user_id: int, week_key: str):
    """Get all plans for a specific week."""
    result = await session.execute(
        select(WeekPlan)
        .where(WeekPlan.user_id == user_id, WeekPlan.week_key == week_key)
        .options(selectinload(WeekPlan.habit).selectinload(Habit.category))
        .order_by(WeekPlan.day_of_week, WeekPlan.time_slot)
    )
    return result.scalars().all()


async def create_week_plan(session: AsyncSession, user_id: int, data: dict):
    """Create a week plan entry for a specific day.
    
    Allows the same habit to be added multiple times to the same day
    (e.g., morning and evening sessions with different time slots).
    """
    # Validate habit ownership — prevent linking to another user's habit
    habit_check = await session.execute(
        select(Habit).where(Habit.id == data["habit_id"], Habit.user_id == user_id)
    )
    if not habit_check.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid habit_id — not owned by user")

    # Always create a new plan row — same habit can appear multiple times per day
    plan = WeekPlan(
        user_id=user_id,
        habit_id=data["habit_id"],
        week_key=data["week_key"],
        day_of_week=data["day_of_week"],
        planned_minutes=data.get("planned_minutes", 30),
        time_slot=data.get("time_slot")
    )
    session.add(plan)

    await session.flush()
    plan_id = plan.id
    await session.commit()

    # Re-fetch with full eager loading (habit + category)
    result = await session.execute(
        select(WeekPlan)
        .where(WeekPlan.id == plan_id, WeekPlan.user_id == user_id)
        .options(selectinload(WeekPlan.habit).selectinload(Habit.category))
    )
    return result.scalar_one()


async def update_week_plan(session: AsyncSession, user_id: int, plan_id: int, data: dict):
    """Update a week plan."""
    # With exclude_unset=True from the router, only explicitly sent fields are present
    update_data = {k: v for k, v in data.items() if v is not None or k == 'time_slot'}

    if not update_data:
        result = await session.execute(
            select(WeekPlan)
            .where(WeekPlan.id == plan_id, WeekPlan.user_id == user_id)
            .options(selectinload(WeekPlan.habit).selectinload(Habit.category))
        )
        return result.scalar_one_or_none()

    await session.execute(
        update(WeekPlan)
        .where(WeekPlan.id == plan_id, WeekPlan.user_id == user_id)
        .values(**update_data)
    )
    await session.commit()

    result = await session.execute(
        select(WeekPlan)
        .where(WeekPlan.id == plan_id, WeekPlan.user_id == user_id)
        .options(selectinload(WeekPlan.habit).selectinload(Habit.category))
    )
    return result.scalar_one_or_none()


async def delete_week_plan(session: AsyncSession, user_id: int, plan_id: int):
    """Delete a week plan."""
    await session.execute(
        delete(WeekPlan)
        .where(WeekPlan.id == plan_id, WeekPlan.user_id == user_id)
    )
    await session.commit()


async def copy_week_plan(session: AsyncSession, user_id: int, from_week: str, to_week: str):
    """Copy all plans from one week to another."""
    source_plans = await get_week_plans(session, user_id, from_week)

    # Get existing plans in target week to avoid duplicates
    existing_result = await session.execute(
        select(WeekPlan.habit_id, WeekPlan.day_of_week)
        .where(WeekPlan.user_id == user_id, WeekPlan.week_key == to_week)
    )
    existing_keys = set((r[0], r[1]) for r in existing_result.all())

    for plan in source_plans:
        if (plan.habit_id, plan.day_of_week) in existing_keys:
            continue  # Skip already-assigned habit+day
        new_plan = WeekPlan(
            user_id=user_id,
            habit_id=plan.habit_id,
            week_key=to_week,
            day_of_week=plan.day_of_week,
            planned_minutes=plan.planned_minutes,
            time_slot=plan.time_slot
        )
        session.add(new_plan)

    await session.commit()

    # Re-fetch all plans for target week with eager loading
    return await get_week_plans(session, user_id, to_week)
