"""
PlanHabits API — Statistics router.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from auth import verify_telegram_auth
from models import WeekStatsOut, StreakOut, HeatmapEntry, TrendPoint
from services import stats_service

router = APIRouter(prefix="/api/stats", tags=["statistics"])


@router.get("/weekly", response_model=WeekStatsOut)
async def get_weekly_stats(
    user_id: int = Depends(verify_telegram_auth),
    week: str = Query(..., pattern=r"^\d{4}-W\d{2}$"),
    session: AsyncSession = Depends(get_session)
):
    """Get comprehensive statistics for a specific week."""
    return await stats_service.get_weekly_stats(session, user_id, week)


@router.get("/streaks", response_model=list[StreakOut])
async def get_streaks(
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Get streak data for all active habits."""
    return await stats_service.get_streaks(session, user_id)


@router.get("/heatmap", response_model=list[HeatmapEntry])
async def get_heatmap(
    user_id: int = Depends(verify_telegram_auth),
    habit_id: int = Query(None, description="Optional: filter by habit"),
    months: int = Query(3, ge=1, le=12),
    session: AsyncSession = Depends(get_session)
):
    """Get heatmap data for the last N months."""
    return await stats_service.get_heatmap(session, user_id, habit_id, months)


@router.get("/trends", response_model=list[TrendPoint])
async def get_trends(
    user_id: int = Depends(verify_telegram_auth),
    weeks: int = Query(8, ge=2, le=52),
    session: AsyncSession = Depends(get_session)
):
    """Get week-over-week completion rate trend data."""
    return await stats_service.get_trends(session, user_id, weeks)
