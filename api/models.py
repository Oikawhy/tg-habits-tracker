"""
PlanHabits API — Pydantic schemas for request/response validation.
"""

from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ─── User ───────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    timezone: Optional[str] = Field("UTC", pattern=r"^[A-Za-z0-9_/+\-]+$", max_length=50)

class UserUpdate(BaseModel):
    timezone: Optional[str] = Field(None, pattern=r"^[A-Za-z0-9_/+\-]+$", max_length=50)
    reminder_enabled: Optional[bool] = None
    reminder_minutes_before: Optional[int] = Field(None, ge=1, le=120)
    weekly_goal_percent: Optional[int] = Field(None, ge=1, le=100)

class UserOut(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    timezone: str
    reminder_enabled: bool
    reminder_minutes_before: int
    weekly_goal_percent: int
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Category ───────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    icon: Optional[str] = Field(None, max_length=10)
    sort_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    icon: Optional[str] = Field(None, max_length=10)
    sort_order: Optional[int] = None

class CategoryOut(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    sort_order: int

    class Config:
        from_attributes = True


# ─── Habit ──────────────────────────────────────────────────────────────────────

class HabitCreate(BaseModel):
    name: str = Field(..., max_length=200)
    color: str = Field(default="#6C5CE7", pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(None, max_length=10)
    default_duration_min: int = Field(default=30, ge=5, le=480)
    category_id: Optional[int] = None

    @field_validator('name')
    @classmethod
    def strip_name(cls, v):
        return v.strip() if v else v

class HabitUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(None, max_length=10)
    default_duration_min: Optional[int] = Field(None, ge=5, le=480)
    category_id: Optional[int] = None
    is_archived: Optional[bool] = None

    @field_validator('name')
    @classmethod
    def strip_name(cls, v):
        return v.strip() if v else v

class HabitOut(BaseModel):
    id: int
    name: str
    color: str
    icon: Optional[str]
    default_duration_min: int
    category_id: Optional[int]
    category: Optional[CategoryOut] = None
    is_archived: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Week Plan ──────────────────────────────────────────────────────────────────

class WeekPlanCreate(BaseModel):
    habit_id: int
    week_key: str = Field(..., pattern=r"^\d{4}-W\d{2}$")
    day_of_week: int = Field(..., ge=1, le=7)  # 1=Mon, 7=Sun
    planned_minutes: int = Field(default=30, ge=5, le=480)
    time_slot: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")  # "09:00"

class WeekPlanUpdate(BaseModel):
    planned_minutes: Optional[int] = Field(None, ge=5, le=480)
    time_slot: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")

class WeekPlanOut(BaseModel):
    id: int
    habit_id: int
    week_key: str
    day_of_week: int
    planned_minutes: int
    time_slot: Optional[str]
    habit: Optional[HabitOut] = None

    class Config:
        from_attributes = True


# ─── Day Entry ──────────────────────────────────────────────────────────────────

class DayEntryUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern=r"^(done|undone|skipped)$")
    actual_minutes: Optional[int] = Field(None, ge=0, le=1440)
    planned_minutes: Optional[int] = Field(None, ge=0, le=1440)
    time_slot: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")

class DayEntryOut(BaseModel):
    id: int
    habit_id: int
    entry_date: date
    planned_minutes: int
    actual_minutes: Optional[int]
    time_slot: Optional[str]
    status: str
    completed_at: Optional[datetime]
    habit: Optional[HabitOut] = None

    class Config:
        from_attributes = True


# ─── Streak ─────────────────────────────────────────────────────────────────────

class StreakOut(BaseModel):
    habit_id: int
    habit_name: str
    habit_color: str
    habit_icon: Optional[str]
    current_streak: int
    best_streak: int
    last_completed_date: Optional[date]
    freeze_available: bool

    class Config:
        from_attributes = True


# ─── Statistics ─────────────────────────────────────────────────────────────────

class HabitStatOut(BaseModel):
    habit_id: int
    habit_name: str
    habit_color: str
    habit_icon: Optional[str]
    total_planned: int  # total planned minutes
    total_actual: int   # total actual minutes
    done_count: int
    undone_count: int
    skipped_count: int
    completion_rate: float  # 0.0 - 1.0

class WeekStatsOut(BaseModel):
    week_key: str
    total_habits_planned: int
    total_habits_done: int
    total_habits_undone: int
    overall_completion_rate: float
    total_planned_minutes: int
    total_actual_minutes: int
    goal_percent: int
    goal_met: bool
    habit_stats: list[HabitStatOut]
    best_day: Optional[str] = None  # "Monday"
    worst_day: Optional[str] = None

class HeatmapEntry(BaseModel):
    date: date
    count: int  # number of habits done
    total: int  # total habits planned
    intensity: float  # 0.0 - 1.0

class TrendPoint(BaseModel):
    week_key: str
    completion_rate: float
