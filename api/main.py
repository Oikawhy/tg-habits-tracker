"""
PlanHabits API — FastAPI application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from database import init_db, get_session, User
from models import UserCreate, UserUpdate, UserOut
from routers.habits import router as habits_router, cat_router as categories_router
from routers.plans import router as plans_router
from routers.entries import router as entries_router
from routers.stats import router as stats_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    yield


app = FastAPI(
    title="PlanHabits API",
    description="Telegram Mini App Habit Tracker API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — allow the mini app to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(habits_router)
app.include_router(categories_router)
app.include_router(plans_router)
app.include_router(entries_router)
app.include_router(stats_router)


# ─── User endpoints ────────────────────────────────────────────────────────────

@app.post("/api/users", response_model=UserOut, status_code=201)
async def create_or_get_user(
    data: UserCreate,
    session: AsyncSession = Depends(get_session)
):
    """Register or retrieve a Telegram user."""
    from sqlalchemy import select
    result = await session.execute(select(User).where(User.id == data.id))
    user = result.scalar_one_or_none()

    if user:
        # Update name/username if changed
        user.first_name = data.first_name
        user.last_name = data.last_name
        user.username = data.username
        await session.commit()
        await session.refresh(user)
        return user

    user = User(
        id=data.id,
        first_name=data.first_name,
        last_name=data.last_name,
        username=data.username
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@app.put("/api/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session)
):
    """Update user settings."""
    from sqlalchemy import select, update
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await session.execute(
            update(User).where(User.id == user_id).values(**update_data)
        )
        await session.commit()

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "planhabits-api"}
