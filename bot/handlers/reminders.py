"""
PlanHabits Bot — Smart reminders handler.
Fetches user list from the API on each run (persists across restarts).
"""

import os
import logging
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

import httpx
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

API_URL = os.getenv("API_URL", "http://api:8000")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


def _internal_headers():
    return {"X-Internal-Key": INTERNAL_API_KEY}


async def _get_all_user_ids(client: httpx.AsyncClient) -> list[int]:
    """Fetch all user IDs from the API (DB-backed, survives restarts)."""
    try:
        resp = await client.get(
            f"{API_URL}/api/internal/users",
            params={"user_id": 0},
            headers=_internal_headers()
        )
        if resp.status_code == 200:
            return [u["id"] for u in resp.json()]
    except Exception as e:
        logger.error(f"Failed to fetch user list: {e}")
    return []


def _get_user_tz(user_data: dict) -> ZoneInfo:
    """Get ZoneInfo from user data, fallback to UTC."""
    tz_name = user_data.get("timezone", "UTC")
    try:
        return ZoneInfo(tz_name)
    except Exception:
        logger.warning(f"Invalid timezone '{tz_name}', using UTC")
        return ZoneInfo("UTC")


async def setup_reminders(context: ContextTypes.DEFAULT_TYPE):
    """
    Check for upcoming habits and send reminders.
    Runs every 2 minutes via job queue.
    """
    try:
        async with httpx.AsyncClient() as client:
            user_ids = await _get_all_user_ids(client)
            if not user_ids:
                return

            today = date.today()

            for user_id in user_ids:
                try:
                    # Get today's entries
                    resp = await client.get(
                        f"{API_URL}/api/entries",
                        params={"user_id": user_id, "date": today.isoformat()},
                        headers=_internal_headers()
                    )
                    if resp.status_code != 200:
                        continue

                    entries = resp.json()

                    # Get user settings
                    user_resp = await client.get(
                        f"{API_URL}/api/users/{user_id}",
                        params={"user_id": user_id},
                        headers=_internal_headers()
                    )
                    if user_resp.status_code != 200:
                        continue
                    user_data = user_resp.json()
                    reminder_enabled = user_data.get("reminder_enabled", True)
                    minutes_before = user_data.get("reminder_minutes_before", 15)

                    if not reminder_enabled:
                        continue

                    # Use user's timezone — not server UTC
                    user_tz = _get_user_tz(user_data)
                    now_user = datetime.now(user_tz)

                    for entry in entries:
                        if entry.get("status") == "done":
                            continue

                        time_slot = entry.get("time_slot")
                        if not time_slot:
                            continue

                        try:
                            slot_hour, slot_min = map(int, time_slot.split(":"))
                            slot_datetime = now_user.replace(
                                hour=slot_hour, minute=slot_min, second=0, microsecond=0
                            )
                            remind_at = slot_datetime - timedelta(minutes=minutes_before)

                            # Window = 3 minutes (wider than interval to avoid misses)
                            remind_key = f"{user_id}_{entry['id']}_{today}"
                            if "sent_reminders" not in context.bot_data:
                                context.bot_data["sent_reminders"] = set()

                            if (
                                remind_at <= now_user <= remind_at + timedelta(minutes=3)
                                and remind_key not in context.bot_data["sent_reminders"]
                            ):
                                habit = entry.get("habit", {})
                                habit_name = habit.get("name", "your habit")
                                habit_icon = habit.get("icon", "📌")

                                await context.bot.send_message(
                                    chat_id=user_id,
                                    text=(
                                        f"⏰ **Reminder!**\n\n"
                                        f"{habit_icon} **{habit_name}** starts in {minutes_before} minutes\n"
                                        f"🕐 Scheduled at {time_slot}\n"
                                        f"⏱ Duration: {entry.get('planned_minutes', 30)} min\n\n"
                                        f"Good luck! 💪"
                                    ),
                                    parse_mode="Markdown"
                                )
                                context.bot_data["sent_reminders"].add(remind_key)
                                logger.info(f"Sent reminder to {user_id} for {habit_name} at {time_slot} (tz={user_tz})")

                        except (ValueError, TypeError):
                            continue

                except Exception as e:
                    logger.error(f"Reminder error for user {user_id}: {e}")

        # Clean up old reminders daily
        if "last_cleanup" not in context.bot_data:
            context.bot_data["last_cleanup"] = date.today()

        if context.bot_data["last_cleanup"] < date.today():
            context.bot_data["sent_reminders"] = set()
            context.bot_data["last_cleanup"] = date.today()

    except Exception as e:
        logger.error(f"Reminder job error: {e}")


def register_user_for_reminders(context: ContextTypes.DEFAULT_TYPE, user_id: int):
    """No longer needed — users are fetched from DB. Kept for backward compat."""
    pass
