"""
PlanHabits API — Statistics service.
"""

from datetime import date, timedelta
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import DayEntry, Habit, Streak, User, WeekPlan


DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _week_dates(week_key: str) -> tuple[date, date]:
    """Get start (Monday) and end (Sunday) dates for a week key like '2026-W16'."""
    year, week = week_key.split("-W")
    start = date.fromisocalendar(int(year), int(week), 1)  # Monday
    end = start + timedelta(days=6)  # Sunday
    return start, end


async def get_weekly_stats(session: AsyncSession, user_id: int, week_key: str):
    """Get comprehensive weekly statistics.
    
    Includes both existing DayEntries AND planned habits from WeekPlan
    that haven't been opened yet (counted as undone).
    """
    start_date, end_date = _week_dates(week_key)

    # Get all entries for the week
    result = await session.execute(
        select(DayEntry, Habit)
        .join(Habit, DayEntry.habit_id == Habit.id)
        .where(
            DayEntry.user_id == user_id,
            DayEntry.entry_date >= start_date,
            DayEntry.entry_date <= end_date
        )
    )
    rows = result.all()

    # Also get planned habits from WeekPlan that have no DayEntry
    plan_result = await session.execute(
        select(WeekPlan, Habit)
        .join(Habit, WeekPlan.habit_id == Habit.id)
        .where(
            WeekPlan.user_id == user_id,
            WeekPlan.week_key == week_key,
            Habit.is_archived == False
        )
    )
    plan_rows = plan_result.all()

    # Track which (habit_id, day) combos already have entries
    existing_combos = set()
    for entry, habit in rows:
        existing_combos.add((entry.habit_id, entry.entry_date.isoweekday()))

    if not rows and not plan_rows:
        return {
            "week_key": week_key,
            "total_habits_planned": 0,
            "total_habits_done": 0,
            "total_habits_undone": 0,
            "overall_completion_rate": 0.0,
            "total_planned_minutes": 0,
            "total_actual_minutes": 0,
            "goal_percent": 100,
            "goal_met": False,
            "habit_stats": [],
            "best_day": None,
            "worst_day": None,
        }

    # Get user's weekly goal
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    goal_percent = user.weekly_goal_percent if user else 100

    # Aggregate by habit
    habit_data = {}
    day_completion = {}  # weekday -> (done, total)

    for entry, habit in rows:
        hid = habit.id
        if hid not in habit_data:
            habit_data[hid] = {
                "habit_id": hid,
                "habit_name": habit.name,
                "habit_color": habit.color,
                "habit_icon": habit.icon,
                "total_planned": 0,
                "total_actual": 0,
                "done_count": 0,
                "undone_count": 0,
                "skipped_count": 0,
            }

        habit_data[hid]["total_planned"] += entry.planned_minutes or 0
        habit_data[hid]["total_actual"] += entry.actual_minutes or 0

        if entry.status == "done":
            habit_data[hid]["done_count"] += 1
        elif entry.status == "undone":
            habit_data[hid]["undone_count"] += 1
        elif entry.status == "skipped":
            habit_data[hid]["skipped_count"] += 1

        # Day-level aggregation
        wd = entry.entry_date.isoweekday()  # 1=Mon, 7=Sun
        if wd not in day_completion:
            day_completion[wd] = {"done": 0, "total": 0}
        day_completion[wd]["total"] += 1
        if entry.status == "done":
            day_completion[wd]["done"] += 1

    # Add planned-but-missing entries as "undone" (user never opened that day)
    for plan, habit in plan_rows:
        if (plan.habit_id, plan.day_of_week) not in existing_combos:
            hid = habit.id
            if hid not in habit_data:
                habit_data[hid] = {
                    "habit_id": hid,
                    "habit_name": habit.name,
                    "habit_color": habit.color,
                    "habit_icon": habit.icon,
                    "total_planned": 0,
                    "total_actual": 0,
                    "done_count": 0,
                    "undone_count": 0,
                    "skipped_count": 0,
                }
            habit_data[hid]["total_planned"] += plan.planned_minutes or 0
            habit_data[hid]["undone_count"] += 1

            wd = plan.day_of_week
            if wd not in day_completion:
                day_completion[wd] = {"done": 0, "total": 0}
            day_completion[wd]["total"] += 1

    # Calculate completion rates per habit
    habit_stats = []
    for hid, data in habit_data.items():
        total_entries = data["done_count"] + data["undone_count"] + data["skipped_count"]
        rate = data["done_count"] / total_entries if total_entries > 0 else 0.0
        data["completion_rate"] = round(rate, 3)
        habit_stats.append(data)

    # Sort by completion rate descending
    habit_stats.sort(key=lambda x: x["completion_rate"], reverse=True)

    # Overall stats
    total_planned = sum(d["done_count"] + d["undone_count"] + d["skipped_count"] for d in habit_data.values())
    total_done = sum(d["done_count"] for d in habit_data.values())
    total_undone = sum(d["undone_count"] for d in habit_data.values())
    overall_rate = total_done / total_planned if total_planned > 0 else 0.0

    # Best and worst days
    best_day = None
    worst_day = None
    if day_completion:
        best_wd = max(day_completion.keys(), key=lambda wd: day_completion[wd]["done"] / max(day_completion[wd]["total"], 1))
        worst_wd = min(day_completion.keys(), key=lambda wd: day_completion[wd]["done"] / max(day_completion[wd]["total"], 1))
        best_day = DAY_NAMES[best_wd - 1]
        worst_day = DAY_NAMES[worst_wd - 1]

    return {
        "week_key": week_key,
        "total_habits_planned": total_planned,
        "total_habits_done": total_done,
        "total_habits_undone": total_undone,
        "overall_completion_rate": round(overall_rate, 3),
        "total_planned_minutes": sum(d["total_planned"] for d in habit_data.values()),
        "total_actual_minutes": sum(d["total_actual"] for d in habit_data.values()),
        "goal_percent": goal_percent,
        "goal_met": overall_rate * 100 >= goal_percent,
        "habit_stats": habit_stats,
        "best_day": best_day,
        "worst_day": worst_day,
    }


async def get_streaks(session: AsyncSession, user_id: int):
    """Get all streaks for a user."""
    result = await session.execute(
        select(Streak, Habit)
        .join(Habit, Streak.habit_id == Habit.id)
        .where(Streak.user_id == user_id, Habit.is_archived == False)
    )
    rows = result.all()

    return [
        {
            "habit_id": habit.id,
            "habit_name": habit.name,
            "habit_color": habit.color,
            "habit_icon": habit.icon,
            "current_streak": streak.current_streak,
            "best_streak": streak.best_streak,
            "last_completed_date": streak.last_completed_date,
            "freeze_available": streak.freeze_available,
        }
        for streak, habit in rows
    ]


async def get_heatmap(session: AsyncSession, user_id: int, habit_id: int | None, months: int = 3):
    """Get heatmap data for the last N months."""
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)

    query = select(
        DayEntry.entry_date,
        func.count().label("total"),
        func.sum(case((DayEntry.status == "done", 1), else_=0)).label("done_count")
    ).where(
        DayEntry.user_id == user_id,
        DayEntry.entry_date >= start_date,
        DayEntry.entry_date <= end_date
    )

    if habit_id:
        query = query.where(DayEntry.habit_id == habit_id)

    query = query.group_by(DayEntry.entry_date).order_by(DayEntry.entry_date)

    result = await session.execute(query)
    rows = result.all()

    return [
        {
            "date": row.entry_date,
            "count": row.done_count,
            "total": row.total,
            "intensity": round(row.done_count / row.total, 2) if row.total > 0 else 0.0,
        }
        for row in rows
    ]


async def get_trends(session: AsyncSession, user_id: int, weeks: int = 8):
    """Get week-over-week completion rate trends."""
    end_date = date.today()
    start_date = end_date - timedelta(weeks=weeks)

    result = await session.execute(
        select(
            DayEntry.entry_date,
            func.count().label("total"),
            func.sum(case((DayEntry.status == "done", 1), else_=0)).label("done_count")
        ).where(
            DayEntry.user_id == user_id,
            DayEntry.entry_date >= start_date,
            DayEntry.entry_date <= end_date
        ).group_by(DayEntry.entry_date)
        .order_by(DayEntry.entry_date)
    )
    rows = result.all()

    # Group by ISO week
    weekly = {}
    for row in rows:
        iso = row.entry_date.isocalendar()
        wk = f"{iso[0]}-W{iso[1]:02d}"
        if wk not in weekly:
            weekly[wk] = {"total": 0, "done": 0}
        weekly[wk]["total"] += row.total
        weekly[wk]["done"] += row.done_count

    return [
        {
            "week_key": wk,
            "completion_rate": round(data["done"] / data["total"], 3) if data["total"] > 0 else 0.0
        }
        for wk, data in sorted(weekly.items())
    ]
