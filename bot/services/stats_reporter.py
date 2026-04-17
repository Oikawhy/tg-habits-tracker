"""
PlanHabits Bot — Weekly stats reporter.
Sends a rich statistics message every Sunday at 20:00.
"""

import os
import logging
from datetime import date, timedelta

import httpx
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

API_URL = os.getenv("API_URL", "http://api:8000")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "planhabits-internal-key-2026")


def _current_week_key() -> str:
    """Get the current ISO week key."""
    iso = date.today().isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _format_stats_message(stats: dict) -> str:
    """Format weekly stats into a rich Telegram message."""
    week = stats.get("week_key", "Unknown")
    total = stats.get("total_habits_planned", 0)
    done = stats.get("total_habits_done", 0)
    undone = stats.get("total_habits_undone", 0)
    rate = stats.get("overall_completion_rate", 0)
    planned_min = stats.get("total_planned_minutes", 0)
    actual_min = stats.get("total_actual_minutes", 0)
    goal = stats.get("goal_percent", 80)
    goal_met = stats.get("goal_met", False)
    best_day = stats.get("best_day", "—")
    worst_day = stats.get("worst_day", "—")

    # Build progress bar
    bar_filled = round(rate * 10)
    bar_empty = 10 - bar_filled
    progress_bar = "█" * bar_filled + "░" * bar_empty

    # Goal emoji
    goal_emoji = "🎯 ✅" if goal_met else "🎯 ❌"

    # Format time
    def fmt_time(minutes):
        if minutes <= 0:
            return "0m"
        h = minutes // 60
        m = minutes % 60
        if h > 0:
            return f"{h}h {m}m" if m else f"{h}h"
        return f"{m}m"

    lines = [
        f"📊 **Week {week} Summary**\n",
        f"{progress_bar} {round(rate * 100)}%",
        f"✅ Done: {done} / {total}",
        f"❌ Undone: {undone}",
        f"⏱ Time: {fmt_time(actual_min)} / {fmt_time(planned_min)} planned",
        f"{goal_emoji} Goal: {goal}% {'— Achieved! 🎉' if goal_met else '— Keep going!'}\n",
        f"📅 Best day: **{best_day}**",
        f"📅 Worst day: **{worst_day}**\n",
    ]

    # Per-habit breakdown
    habit_stats = stats.get("habit_stats", [])
    if habit_stats:
        lines.append("**📋 Per-Habit Breakdown:**\n")
        for hs in habit_stats[:10]:  # Top 10
            icon = hs.get("habit_icon") or "•"
            name = hs.get("habit_name", "Unknown")
            h_rate = round(hs.get("completion_rate", 0) * 100)
            h_done = hs.get("done_count", 0)
            h_total = h_done + hs.get("undone_count", 0) + hs.get("skipped_count", 0)
            h_actual = fmt_time(hs.get("total_actual", 0))
            h_planned = fmt_time(hs.get("total_planned", 0))

            status = "✅" if h_rate >= 80 else "⚠️" if h_rate >= 50 else "❌"
            lines.append(f"{icon} {name}: {status} {h_done}/{h_total} ({h_rate}%) — {h_actual}/{h_planned}")

    lines.append("\n💪 Keep building those habits!")

    return "\n".join(lines)


async def send_weekly_stats(context: ContextTypes.DEFAULT_TYPE):
    """Send weekly stats to all registered users. Triggered Sunday 20:00."""
    week_key = _current_week_key()
    logger.info(f"Sending weekly stats for {week_key}")

    users = context.bot_data.get("users", set())
    if not users:
        logger.info("No users registered for stats")
        return

    internal_headers = {"X-Internal-Key": INTERNAL_API_KEY}

    async with httpx.AsyncClient() as client:
        for user_id in users:
            try:
                resp = await client.get(
                    f"{API_URL}/api/stats/weekly",
                    params={"user_id": user_id, "week": week_key},
                    headers=internal_headers
                )
                if resp.status_code != 200:
                    logger.error(f"Failed to get stats for user {user_id}: {resp.status_code}")
                    continue

                stats = resp.json()
                message = _format_stats_message(stats)

                await context.bot.send_message(
                    chat_id=user_id,
                    text=message,
                    parse_mode="Markdown"
                )
                logger.info(f"Sent weekly stats to user {user_id}")

                # Also send streaks
                streaks_resp = await client.get(
                    f"{API_URL}/api/stats/streaks",
                    params={"user_id": user_id},
                    headers=internal_headers
                )
                if streaks_resp.status_code == 200:
                    streaks = streaks_resp.json()
                    active_streaks = [s for s in streaks if s.get("current_streak", 0) > 0]

                    if active_streaks:
                        streak_lines = ["🔥 **Active Streaks:**\n"]
                        for s in sorted(active_streaks, key=lambda x: x["current_streak"], reverse=True):
                            icon = s.get("habit_icon") or "•"
                            name = s.get("habit_name", "Unknown")
                            current = s.get("current_streak", 0)
                            best = s.get("best_streak", 0)
                            freeze = "🛡️" if s.get("freeze_available") else ""
                            streak_lines.append(f"{icon} {name}: 🔥 {current} days (best: {best}) {freeze}")

                        await context.bot.send_message(
                            chat_id=user_id,
                            text="\n".join(streak_lines),
                            parse_mode="Markdown"
                        )

            except Exception as e:
                logger.error(f"Failed to send stats to user {user_id}: {e}")


async def reset_freezes(context: ContextTypes.DEFAULT_TYPE):
    """Reset streak freezes at the start of each week (Monday)."""
    logger.info("Resetting weekly streak freezes")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{API_URL}/api/entries/reset-freezes",
                params={"user_id": 0},  # Internal call
                headers={"X-Internal-Key": INTERNAL_API_KEY}
            )
            if resp.status_code == 200:
                logger.info("Streak freezes reset successfully")
            else:
                logger.error(f"Failed to reset freezes: {resp.status_code}")
    except Exception as e:
        logger.error(f"Failed to reset freezes: {e}")
