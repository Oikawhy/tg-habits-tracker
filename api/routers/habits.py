"""
PlanHabits API — Habits router.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from auth import verify_telegram_auth
from models import HabitCreate, HabitUpdate, HabitOut, CategoryCreate, CategoryUpdate, CategoryOut
from services import habit_service

router = APIRouter(prefix="/api/habits", tags=["habits"])


@router.get("", response_model=list[HabitOut])
async def list_habits(
    user_id: int = Depends(verify_telegram_auth),
    include_archived: bool = Query(False),
    session: AsyncSession = Depends(get_session)
):
    """Get all habits for a user."""
    habits = await habit_service.get_habits(session, user_id, include_archived)
    return habits


@router.get("/{habit_id}", response_model=HabitOut)
async def get_habit(
    habit_id: int,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Get a single habit."""
    habit = await habit_service.get_habit(session, user_id, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.post("", response_model=HabitOut, status_code=201)
async def create_habit(
    data: HabitCreate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Create a new habit."""
    habit = await habit_service.create_habit(session, user_id, data.model_dump())
    return habit


@router.put("/{habit_id}", response_model=HabitOut)
async def update_habit(
    habit_id: int,
    data: HabitUpdate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Update a habit."""
    habit = await habit_service.update_habit(session, user_id, habit_id, data.model_dump())
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.delete("/{habit_id}", status_code=204)
async def delete_habit(
    habit_id: int,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Permanently delete a habit."""
    await habit_service.delete_habit(session, user_id, habit_id)


# ─── Categories ─────────────────────────────────────────────────────────────────

cat_router = APIRouter(prefix="/api/categories", tags=["categories"])


@cat_router.get("", response_model=list[CategoryOut])
async def list_categories(
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Get all categories."""
    return await habit_service.get_categories(session, user_id)


@cat_router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Create a category."""
    return await habit_service.create_category(session, user_id, data.model_dump())


@cat_router.put("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    user_id: int = Depends(verify_telegram_auth),
    session: AsyncSession = Depends(get_session)
):
    """Update a category."""
    cat = await habit_service.update_category(session, user_id, category_id, data.model_dump())
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@cat_router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    user_id: int = Depends(verify_telegram_auth),
    delete_habits: bool = Query(False, description="If true, also delete all habits in this category"),
    session: AsyncSession = Depends(get_session)
):
    """Delete a category. Optionally delete its habits too."""
    await habit_service.delete_category(session, user_id, category_id, delete_habits=delete_habits)
