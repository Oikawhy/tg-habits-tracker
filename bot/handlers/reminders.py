"""
PlanHabits Bot — Smart reminders handler.
"""

import os
import logging
from datetime import datetime, date, timedelta

import httpx
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

API_URL = os.getenv("API_URL", "http://api:8000")


async def setup_reminders(context: ContextTypes.DEFAULT_TYPE):
    """
    Check for upcoming habits and send reminders.
    Runs every 5 minutes via job queue.
    """
    try:
        async with httpx.AsyncClient() as client:
            # Get all users (we need a users list endpoint for this)
            # For now, we store reminded users in bot_data
            if "users" not in context.bot_data:
                context.bot_data["users"] = set()

            today = date.today()
            now = datetime.now()
            current_time = now.strftime("%H:%M")

            for user_id in list(context.bot_data["users"]):
                try:
                    # Get user settings
                    resp = await client.get(
                        f"{API_URL}/api/entries",
                        params={"user_id": user_id, "date": today.isoformat()}
                    )
                    if resp.status_code != 200:
                        continue

                    entries = resp.json()

                    # Get user's reminder setting
                    user_resp = await client.post(
                        f"{API_URL}/api/users",
                        json={"id": user_id, "first_name": ""}
                    )
                    user_data = user_resp.json() if user_resp.status_code == 201 else {}
                    reminder_enabled = user_data.get("reminder_enabled", True)
                    minutes_before = user_data.get("reminder_minutes_before", 15)

                    if not reminder_enabled:
                        continue

                    for entry in entries:
                        if entry.get("status") == "done":
                            continue

                        time_slot = entry.get("time_slot")
                        if not time_slot:
                            continue

                        # Check if we should remind now
                        try:
                            slot_hour, slot_min = map(int, time_slot.split(":"))
                            slot_datetime = now.replace(
                                hour=slot_hour, minute=slot_min, second=0, microsecond=0
                            )
                            remind_at = slot_datetime - timedelta(minutes=minutes_before)

                            # Check if current time is within the reminder window (5 min)
                            remind_key = f"{user_id}_{entry['id']}_{today}"
                            if "sent_reminders" not in context.bot_data:
                                context.bot_data["sent_reminders"] = set()

                            if (
                                remind_at <= now <= remind_at + timedelta(minutes=5)
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
                                logger.info(f"Sent reminder to {user_id} for {habit_name}")

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
    """Register a user to receive reminders."""
    if "users" not in context.bot_data:
        context.bot_data["users"] = set()
    context.bot_data["users"].add(user_id)
