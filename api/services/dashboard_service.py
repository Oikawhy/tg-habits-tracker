"""
PlanHabits API — Dashboard service.
Returns aggregated data for the Today screen in a single query batch,
replacing 11 separate API calls with 1.
"""

from datetime import date, timedelta
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import DayEntry, Habit, Streak, WeekPlan


def _iso_weekday(d: date) -> int:
    return d.isoweekday()

def _week_key(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"

def _week_dates(week_key: str) -> tuple[date, date]:
    year, week = week_key.split("-W")
    start = date.fromisocalendar(int(year), int(week), 1)
    end = start + timedelta(days=6)
    return start, end


async def get_dashboard(session: AsyncSession, user_id: int, target_date: date):
    """Return all data the Today screen needs in a single response.
    
    Performs sync + entries + streaks + weekly summary + 7-day strip
    in a batched set of queries instead of 11 separate API calls.
    """
    from services.entry_service import sync_entries_with_plan

    week_key = _week_key(target_date)
    start_date, end_date = _week_dates(week_key)

    # 1. Sync entries for the requested date (mutating)
    await sync_entries_with_plan(session, user_id, target_date)

    # 2. Get entries for the requested date (with habit + category eager load)
    entry_result = await session.execute(
        select(DayEntry)
        .where(DayEntry.user_id == user_id, DayEntry.entry_date == target_date)
        .options(selectinload(DayEntry.habit).selectinload(Habit.category))
        .order_by(DayEntry.time_slot, DayEntry.id)
    )
    entries = entry_result.scalars().all()

    # 3. Get streaks for all active habits (single query)
    streak_result = await session.execute(
        select(Streak)
        .join(Habit, Streak.habit_id == Habit.id)
        .where(
            Streak.user_id == user_id,
            Habit.is_archived == False
        )
        .options(selectinload(Streak.habit))
    )
    streaks = streak_result.scalars().all()

    # 4. Weekly completion stats (single aggregate query)
    week_stats_result = await session.execute(
        select(
            func.count(DayEntry.id).label('total'),
            func.count(case((DayEntry.status == 'done', 1))).label('done'),
        )
        .where(
            DayEntry.user_id == user_id,
            DayEntry.entry_date >= start_date,
            DayEntry.entry_date <= end_date,
        )
    )
    week_row = week_stats_result.one()
    total_planned = week_row.total or 0
    total_done = week_row.done or 0

    # Also count planned habits from WeekPlan that have no DayEntry yet
    plan_count_result = await session.execute(
        select(func.count(WeekPlan.id))
        .join(Habit, WeekPlan.habit_id == Habit.id)
        .where(
            WeekPlan.user_id == user_id,
            WeekPlan.week_key == week_key,
            Habit.is_archived == False
        )
    )
    total_planned_from_plan = plan_count_result.scalar() or 0
    # Use whichever is higher (plans may not all have entries yet)
    effective_total = max(total_planned, total_planned_from_plan)
    completion_rate = total_done / effective_total if effective_total > 0 else 0

    # 5. Week strip: 7-day summary with entry colors and completion
    week_strip_result = await session.execute(
        select(DayEntry)
        .where(
            DayEntry.user_id == user_id,
            DayEntry.entry_date >= start_date,
            DayEntry.entry_date <= end_date,
        )
        .options(selectinload(DayEntry.habit))
        .order_by(DayEntry.entry_date, DayEntry.time_slot)
    )
    all_week_entries = week_strip_result.scalars().all()

    # Group by date
    week_strip = {}
    for d_offset in range(7):
        d = start_date + timedelta(days=d_offset)
        d_str = d.isoformat()
        day_entries = [e for e in all_week_entries if e.entry_date == d]
        done_count = sum(1 for e in day_entries if e.status == 'done')
        week_strip[d_str] = {
            "dots": [
                {
                    "color": (e.habit.color if e.habit else "#6C5CE7"),
                    "done": e.status == "done"
                }
                for e in day_entries
            ],
            "total": len(day_entries),
            "done": done_count,
            "percent": round(done_count / len(day_entries) * 100) if day_entries else 0,
        }

    return {
        "entries": entries,
        "streaks": streaks,
        "weekly_goal": {
            "total_planned": effective_total,
            "total_done": total_done,
            "completion_rate": completion_rate,
            "goal_percent": 100,  # Default; could be user-configurable
        },
        "week_strip": week_strip,
    }
