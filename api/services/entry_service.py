"""
PlanHabits API — Entry service (day entries + streak management).
"""

from datetime import date, datetime, timedelta, timezone
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
    """Get all entries for a specific day (read-only, no side effects).
    
    Frontend should call POST /entries/sync before this to ensure entries
    are up-to-date with the current week plan.
    """
    result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == entry_date)
        .options(selectinload(DayEntry.habit).selectinload(Habit.category))
        .order_by(DayEntry.time_slot, DayEntry.id)
    )
    return result.scalars().all()


async def sync_entries_with_plan(session: AsyncSession, user_id: int, entry_date: date):
    """Sync day entries with the current week plan.
    
    Uses (habit_id, time_slot) pairs to support the same habit at different
    times on the same day (e.g., morning + evening meditation).
    
    - Removes undone entries whose (habit, time_slot) is no longer planned.
    - Adds entries for (habit, time_slot) combos that are planned but missing.
    - Updates undone entries if plan details changed.
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

    # Build set of (habit_id, time_slot) keys that should have entries today
    planned_keys = set()  # (habit_id, time_slot) tuples
    plan_by_key = {}
    for plan in plans:
        if not plan.habit.is_archived:
            key = (plan.habit_id, plan.time_slot)
            planned_keys.add(key)
            plan_by_key[key] = plan

    # Get existing entries for this day
    entry_result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == entry_date)
    )
    existing_entries = entry_result.scalars().all()
    existing_keys = set()  # (habit_id, time_slot) of existing entries

    # Remove stale entries / update existing undone entries
    for entry in existing_entries:
        key = (entry.habit_id, entry.time_slot)
        existing_keys.add(key)

        if key not in planned_keys and entry.status == "undone":
            # This (habit, time_slot) is no longer in the plan — remove
            await session.delete(entry)
        elif key in planned_keys and entry.status == "undone":
            # Still planned — update if plan changed
            plan = plan_by_key[key]
            if entry.planned_minutes != plan.planned_minutes:
                entry.planned_minutes = plan.planned_minutes

    # Add missing entries (planned but no entry yet)
    for key in planned_keys:
        if key not in existing_keys:
            plan = plan_by_key[key]
            new_entry = DayEntry(
                user_id=user_id,
                habit_id=plan.habit_id,
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
            entry.completed_at = datetime.now(timezone.utc)
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
    """Incrementally update streak for a habit after a status change.
    
    O(1) for the common case (consecutive day completion).
    Falls back to a short scan only when gaps exist.
    """
    # Get or create streak record
    result = await session.execute(
        select(Streak).where(Streak.user_id == user_id, Streak.habit_id == habit_id)
    )
    streak = result.scalar_one_or_none()
    if not streak:
        streak = Streak(user_id=user_id, habit_id=habit_id, current_streak=0, best_streak=0, freeze_available=True)
        session.add(streak)

    # Check if current entry is done
    entry_result = await session.execute(
        select(DayEntry.status).where(
            DayEntry.user_id == user_id,
            DayEntry.habit_id == habit_id,
            DayEntry.entry_date == current_date,
            DayEntry.status == "done"
        )
    )
    is_done_today = entry_result.scalar_one_or_none() is not None

    if is_done_today:
        last = streak.last_completed_date

        if last is None:
            # First ever completion
            streak.current_streak = 1
        elif current_date == last:
            # Same day — no change needed, but recalc to be safe
            streak.current_streak = max(streak.current_streak, 1)
        elif current_date == last + timedelta(days=1):
            # Consecutive day — O(1) increment
            streak.current_streak += 1
        else:
            # Gap exists — check if all gap days were unplanned/skipped
            gap_days = (current_date - last).days - 1
            if gap_days <= 30:
                # Short gap: scan gap days to see if streak survives
                gap_broken = False
                for i in range(1, gap_days + 1):
                    gap_date = last + timedelta(days=i)
                    gap_entry = await session.execute(
                        select(DayEntry.status).where(
                            DayEntry.user_id == user_id,
                            DayEntry.habit_id == habit_id,
                            DayEntry.entry_date == gap_date,
                        )
                    )
                    gap_status = gap_entry.scalar_one_or_none()

                    if gap_status is None or gap_status in ("skipped",):
                        # Not planned or skipped — streak survives
                        continue
                    elif gap_status == "undone":
                        # Planned but undone — streak broken
                        gap_broken = True
                        break

                if gap_broken:
                    streak.current_streak = 1
                else:
                    streak.current_streak += 1
            else:
                # Very long gap — just reset
                streak.current_streak = 1

        streak.last_completed_date = current_date
        streak.best_streak = max(streak.best_streak, streak.current_streak)
    else:
        # Marked as undone/skipped — recalculate backward (short scan)
        if streak.last_completed_date == current_date:
            # Was the most recent completion — need to recalc
            consecutive = 0
            check_date = current_date - timedelta(days=1)
            lookback_limit = current_date - timedelta(days=60)

            while check_date >= lookback_limit:
                entry_res = await session.execute(
                    select(DayEntry.status).where(
                        DayEntry.user_id == user_id,
                        DayEntry.habit_id == habit_id,
                        DayEntry.entry_date == check_date,
                    )
                )
                status = entry_res.scalar_one_or_none()

                if status == "done":
                    consecutive += 1
                    streak.last_completed_date = check_date
                    check_date -= timedelta(days=1)
                elif status in (None, "skipped"):
                    # Unplanned or skipped — skip day
                    check_date -= timedelta(days=1)
                else:
                    break

            streak.current_streak = consecutive

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
