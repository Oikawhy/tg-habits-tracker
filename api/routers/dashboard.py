"""
PlanHabits API — Dashboard router.
Single aggregated endpoint for the Today screen.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from auth import verify_telegram_or_internal as verify_auth
from services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(
    user_id: int = Depends(verify_auth),
    date: date = Query(..., description="Date in YYYY-MM-DD format"),
    session: AsyncSession = Depends(get_session)
):
    """Get aggregated data for the Today screen in a single response.
    
    Returns entries, streaks, weekly goal progress, and 7-day strip data.
    Replaces 11 separate API calls (sync + entries + streaks + weekly stats + 7 day dots).
    """
    result = await dashboard_service.get_dashboard(session, user_id, date)
    
    # Manually serialize ORM objects
    entries_out = []
    for e in result["entries"]:
        habit = e.habit
        category = habit.category if habit else None
        entries_out.append({
            "id": e.id,
            "user_id": e.user_id,
            "habit_id": e.habit_id,
            "entry_date": e.entry_date.isoformat(),
            "planned_minutes": e.planned_minutes,
            "actual_minutes": e.actual_minutes,
            "time_slot": e.time_slot,
            "status": e.status,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "habit": {
                "id": habit.id,
                "name": habit.name,
                "color": habit.color,
                "icon": habit.icon,
                "default_duration_min": habit.default_duration_min,
                "is_archived": habit.is_archived,
                "category": {
                    "id": category.id,
                    "name": category.name,
                    "icon": category.icon,
                } if category else None,
            } if habit else None,
        })

    streaks_out = []
    for s in result["streaks"]:
        habit = s.habit
        streaks_out.append({
            "habit_id": s.habit_id,
            "habit_name": habit.name if habit else "Unknown",
            "habit_icon": habit.icon if habit else None,
            "current_streak": s.current_streak,
            "best_streak": s.best_streak,
            "last_completed_date": s.last_completed_date.isoformat() if s.last_completed_date else None,
            "freeze_available": s.freeze_available,
        })

    return {
        "entries": entries_out,
        "streaks": streaks_out,
        "weekly_goal": result["weekly_goal"],
        "week_strip": result["week_strip"],
    }
