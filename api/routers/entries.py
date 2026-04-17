"""
PlanHabits API — Day entries router.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from auth import verify_telegram_or_internal as verify_auth
from models import DayEntryUpdate, DayEntryOut
from services import entry_service

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.get("", response_model=list[DayEntryOut])
async def list_day_entries(
    user_id: int = Depends(verify_auth),
    date: date = Query(..., description="Date in YYYY-MM-DD format"),
    session: AsyncSession = Depends(get_session)
):
    """Get all entries for a specific day. Auto-syncs with week plan."""
    return await entry_service.get_day_entries(session, user_id, date)


@router.post("/sync")
async def sync_entries(
    user_id: int = Depends(verify_auth),
    date: date = Query(..., description="Date in YYYY-MM-DD format"),
    session: AsyncSession = Depends(get_session)
):
    """Explicitly sync entries with the current week plan.
    This is the proper endpoint for mutating operations.
    """
    await entry_service.sync_entries_with_plan(session, user_id, date)
    return {"status": "synced"}


@router.put("/{entry_id}", response_model=DayEntryOut)
async def update_entry(
    entry_id: int,
    data: DayEntryUpdate,
    user_id: int = Depends(verify_auth),
    session: AsyncSession = Depends(get_session)
):
    """Update a day entry (mark done/undone, log actual time)."""
    entry = await entry_service.update_entry(session, user_id, entry_id, data.model_dump())
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.post("/generate", response_model=list[DayEntryOut])
async def generate_entries(
    user_id: int = Depends(verify_auth),
    date: date = Query(...),
    session: AsyncSession = Depends(get_session)
):
    """Force-generate entries from week plan for a specific date."""
    return await entry_service.generate_entries_from_plan(session, user_id, date)


@router.post("/freeze")
async def use_freeze(
    user_id: int = Depends(verify_auth),
    habit_id: int = Query(...),
    week: str = Query(..., pattern=r"^\d{4}-W\d{2}$"),
    session: AsyncSession = Depends(get_session)
):
    """Use a streak freeze for a habit this week."""
    result = await entry_service.use_streak_freeze(session, user_id, habit_id, week)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
