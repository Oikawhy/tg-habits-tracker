"""
PlanHabits API — FastAPI application entry point.
"""

import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import init_db, get_session, User
from auth import verify_telegram_auth
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
    version="1.1.0",
    lifespan=lifespan
)


# ─── Security Headers Middleware ────────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# CORS — restrict to ngrok domains only
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.ngrok-free\.dev|https://.*\.ngrok\.io",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Telegram-InitData", "X-Internal-Key"],
)

# Mount routers
app.include_router(habits_router)
app.include_router(categories_router)
app.include_router(plans_router)
app.include_router(entries_router)
app.include_router(stats_router)


# ─── User endpoints ────────────────────────────────────────────────────────────

@app.get("/api/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Get a user by ID (internal/bot use)."""
    from sqlalchemy import select
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/api/users", response_model=UserOut, status_code=201)
async def create_or_get_user(
    data: UserCreate,
    session: AsyncSession = Depends(get_session)
):
    """Register or retrieve a Telegram user.
    Only updates name fields if the new values are non-empty.
    """
    from sqlalchemy import select
    result = await session.execute(select(User).where(User.id == data.id))
    user = result.scalar_one_or_none()

    if user:
        # Only update non-empty name fields to prevent data erasure
        if data.first_name and data.first_name.strip():
            user.first_name = data.first_name
        if data.last_name and data.last_name.strip():
            user.last_name = data.last_name
        if data.username and data.username.strip():
            user.username = data.username
        await session.commit()
        await session.refresh(user)
        return user

    user = User(
        id=data.id,
        first_name=data.first_name or "User",
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
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "planhabits-api"}
