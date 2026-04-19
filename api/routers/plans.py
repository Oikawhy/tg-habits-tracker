"""
PlanHabits API — Week plans router.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from auth import verify_telegram_auth
from models import WeekPlanCreate, WeekPlanUpdate, WeekPlanOut
from services import plan_service

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("", response_model=list[WeekPlanOut])
async def list_week_plans(
    user_id: int = Depends(verify_telegram_auth),
    week: str = Query(..., pattern=r"^\d{4}-W\d{2}$", description="ISO week like 2026-W16"),
    session: AsyncSession = Depends(get_session)
):
    """Get all plans for a specific week."""
    return await plan_service.get_week_plans(session, user_id, week)


@router.post("", response_model=WeekPlanOut, status_code=201)
async def create_week_plan(
    data: WeekPlanCreate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Create or update a week plan (upserts by habit+week)."""
    return await plan_service.create_week_plan(session, user_id, data.model_dump())


@router.put("/{plan_id}", response_model=WeekPlanOut)
async def update_week_plan(
    plan_id: int,
    data: WeekPlanUpdate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Update a week plan."""
    plan = await plan_service.update_week_plan(session, user_id, plan_id, data.model_dump(exclude_unset=True))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_week_plan(
    plan_id: int,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Remove a habit from a week plan."""
    await plan_service.delete_week_plan(session, user_id, plan_id)


@router.post("/copy", response_model=list[WeekPlanOut])
async def copy_week_plan(
    user_id: int = Depends(verify_telegram_auth),
    from_week: str = Query(..., pattern=r"^\d{4}-W\d{2}$"),
    to_week: str = Query(..., pattern=r"^\d{4}-W\d{2}$"),
    session: AsyncSession = Depends(get_session)
):
    """Copy all plans from one week to another."""
    return await plan_service.copy_week_plan(session, user_id, from_week, to_week)
