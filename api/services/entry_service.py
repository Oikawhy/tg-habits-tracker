"""
PlanHabits API — Entry service (day entries + streak management).
"""

from datetime import date, datetime, timedelta
from sqlalchemy import select, update, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import DayEntry, WeekPlan, Habit, Streak


def _iso_weekday(d: date) -> int:
    """Return ISO weekday: Mon=1 ... Sun=7."""
    return d.isoweekday()


def _week_key(d: date) -> str:
    """Return ISO week key like '2026-W16'."""
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


async def get_day_entries(session: AsyncSession, user_id: int, entry_date: date):
    """Get all entries for a specific day, syncing with current plan state."""
    # Always sync entries with the current plan
    await sync_entries_with_plan(session, user_id, entry_date)

    result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == entry_date)
        .options(selectinload(DayEntry.habit).selectinload(Habit.category))
        .order_by(DayEntry.time_slot, DayEntry.id)
    )
    return result.scalars().all()


async def sync_entries_with_plan(session: AsyncSession, user_id: int, entry_date: date):
    """Sync day entries with the current week plan.
    - Removes undone entries whose habits are no longer planned for this day.
    - Adds entries for habits that are planned but don't have an entry yet.
    """
    wk = _week_key(entry_date)
    weekday = _iso_weekday(entry_date)

    # Get plans specifically for this day
    plan_result = await session.execute(
        select(WeekPlan)
        .where(
            WeekPlan.user_id == user_id,
            WeekPlan.week_key == wk,
            WeekPlan.day_of_week == weekday
        )
        .options(selectinload(WeekPlan.habit))
    )
    plans = plan_result.scalars().all()

    # Build set of habit_ids that should have entries today
    planned_habit_ids = set()
    plan_by_habit = {}
    for plan in plans:
        if not plan.habit.is_archived:
            planned_habit_ids.add(plan.habit_id)
            plan_by_habit[plan.habit_id] = plan

    # Get existing entries for this day
    entry_result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == entry_date)
    )
    existing_entries = entry_result.scalars().all()
    existing_habit_ids = set()

    # Remove stale entries (habit no longer planned, and entry not yet done)
    for entry in existing_entries:
        existing_habit_ids.add(entry.habit_id)
        if entry.habit_id not in planned_habit_ids and entry.status == "undone":
            await session.delete(entry)
        elif entry.habit_id in planned_habit_ids and entry.status == "undone":
            # Update existing undone entries if plan changed (e.g. time_slot added)
            plan = plan_by_habit[entry.habit_id]
            if entry.time_slot != plan.time_slot:
                entry.time_slot = plan.time_slot
            if entry.planned_minutes != plan.planned_minutes:
                entry.planned_minutes = plan.planned_minutes

    # Add missing entries (planned but no entry yet)
    for habit_id in planned_habit_ids:
        if habit_id not in existing_habit_ids:
            plan = plan_by_habit[habit_id]
            new_entry = DayEntry(
                user_id=user_id,
                habit_id=habit_id,
                entry_date=entry_date,
                planned_minutes=plan.planned_minutes,
                time_slot=plan.time_slot,
                status="undone"
            )
            session.add(new_entry)

    await session.commit()


async def generate_entries_from_plan(session: AsyncSession, user_id: int, entry_date: date):
    """Generate day entries from the week plan for a specific date."""
    await sync_entries_with_plan(session, user_id, entry_date)

    result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == entry_date)
        .options(selectinload(DayEntry.habit).selectinload(Habit.category))
        .order_by(DayEntry.time_slot, DayEntry.id)
    )
    return result.scalars().all()


async def update_entry(session: AsyncSession, user_id: int, entry_id: int, data: dict):
    """Update a day entry (mark done/undone, log time)."""
    result = await session.execute(
        select(DayEntry).where(DayEntry.id == entry_id, DayEntry.user_id == user_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return None

    old_status = entry.status

    if "status" in data and data["status"] is not None:
        entry.status = data["status"]
        if data["status"] == "done":
            entry.completed_at = datetime.utcnow()
        elif data["status"] in ("undone", "skipped"):
            entry.completed_at = None

    if "actual_minutes" in data and data["actual_minutes"] is not None:
        entry.actual_minutes = data["actual_minutes"]

    if "planned_minutes" in data and data["planned_minutes"] is not None:
        entry.planned_minutes = data["planned_minutes"]

    if "time_slot" in data and data["time_slot"] is not None:
        entry.time_slot = data["time_slot"]

    await session.commit()

    # Update streak if status changed
    if "status" in data and data["status"] != old_status:
        await _update_streak(session, user_id, entry.habit_id, entry.entry_date)

    # Reload with relations
    result = await session.execute(
        select(DayEntry)
        .where(DayEntry.id == entry_id)
        .options(selectinload(DayEntry.habit).selectinload(Habit.category))
    )
    return result.scalar_one_or_none()


async def _update_streak(session: AsyncSession, user_id: int, habit_id: int, current_date: date):
    """Recalculate streak for a habit after a status change."""
    # Get streak record
    result = await session.execute(
        select(Streak).where(Streak.user_id == user_id, Streak.habit_id == habit_id)
    )
    streak = result.scalar_one_or_none()
    if not streak:
        streak = Streak(user_id=user_id, habit_id=habit_id, current_streak=0, best_streak=0, freeze_available=True)
        session.add(streak)

    # Count consecutive days backward from current_date
    consecutive = 0
    check_date = current_date

    while True:
        entry_result = await session.execute(
            select(DayEntry).where(
                DayEntry.user_id == user_id,
                DayEntry.habit_id == habit_id,
                DayEntry.entry_date == check_date
            )
        )
        entry = entry_result.scalar_one_or_none()

        if entry and entry.status == "done":
            consecutive += 1
            check_date -= timedelta(days=1)
        elif entry and entry.status == "skipped":
            # Skipped days don't break streaks, but don't add either
            check_date -= timedelta(days=1)
        else:
            # Check if there was even a planned entry for this date
            plan_result = await session.execute(
                select(DayEntry).where(
                    DayEntry.user_id == user_id,
                    DayEntry.habit_id == habit_id,
                    DayEntry.entry_date == check_date
                )
            )
            if not plan_result.scalar_one_or_none():
                # No entry planned = day off, don't break streak
                if check_date < current_date - timedelta(days=7):
                    break  # Safety limit
                check_date -= timedelta(days=1)
            else:
                break  # Missed planned entry = streak broken

    streak.current_streak = consecutive
    if consecutive > streak.best_streak:
        streak.best_streak = consecutive
    streak.last_completed_date = current_date if consecutive > 0 else streak.last_completed_date

    await session.commit()


async def use_streak_freeze(session: AsyncSession, user_id: int, habit_id: int, week_key: str):
    """Use the weekly streak freeze for a habit."""
    result = await session.execute(
        select(Streak).where(Streak.user_id == user_id, Streak.habit_id == habit_id)
    )
    streak = result.scalar_one_or_none()
    if not streak:
        return {"error": "No streak found"}

    if not streak.freeze_available or streak.freeze_used_week == week_key:
        return {"error": "Freeze already used this week"}

    streak.freeze_available = False
    streak.freeze_used_week = week_key
    await session.commit()
    return {"success": True, "message": "Streak freeze activated!"}


async def reset_weekly_freezes(session: AsyncSession):
    """Reset all freezes at the start of a new week (called by scheduler)."""
    await session.execute(
        update(Streak).values(freeze_available=True)
    )
    await session.commit()
