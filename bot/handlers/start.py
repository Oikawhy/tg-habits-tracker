"""
PlanHabits Bot — /start and /help command handlers.
"""

import os
import logging

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ContextTypes

import httpx

logger = logging.getLogger(__name__)

WEBAPP_URL = os.getenv("WEBAPP_URL", "https://localhost")
API_URL = os.getenv("API_URL", "http://api:8000")


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start — register user and show Mini App button."""
    user = update.effective_user
    if not user:
        return

    # Register user in the API
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_URL}/api/users", json={
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name or "",
                "username": user.username or ""
            })
    except Exception as e:
        logger.error(f"Failed to register user: {e}")

    # Build Mini App URL with user context
    webapp_url = f"{WEBAPP_URL}?user_id={user.id}"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="📋 Open PlanHabits",
            web_app=WebAppInfo(url=webapp_url)
        )],
        [InlineKeyboardButton(
            text="📊 Weekly Stats",
            callback_data="weekly_stats"
        )],
    ])

    welcome_text = (
        f"👋 Welcome to **PlanHabits**, {user.first_name}!\n\n"
        "🎯 Track your habits, build streaks, and see your progress.\n\n"
        "**How it works:**\n"
        "1️⃣ Open the app and add your habits\n"
        "2️⃣ Plan your week — assign habits to days\n"
        "3️⃣ Check off habits as you complete them\n"
        "4️⃣ Get weekly stats every Sunday evening\n\n"
        "Tap the button below to get started! 🚀"
    )

    await update.message.reply_text(
        welcome_text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help — show instructions."""
    help_text = (
        "📖 **PlanHabits Help**\n\n"
        "**Commands:**\n"
        "/start — Open the habit tracker\n"
        "/help — Show this help message\n\n"
        "**Features:**\n"
        "• 📅 Plan habits per week with colors\n"
        "• ⏱ Track time spent on each habit\n"
        "• ✅ Mark habits done/undone daily\n"
        "• 🔥 Build streaks for consistency\n"
        "• 🛡️ Streak freeze — 1 per week\n"
        "• 📊 Weekly statistics every Sunday\n"
        "• 📈 Trend graphs over time\n"
        "• 🏷️ Organize habits by category\n"
        "• 🎯 Set weekly completion goals\n"
        "• ⏰ Smart reminders before habits\n\n"
        "Tap 📋 **Open PlanHabits** to begin!"
    )

    await update.message.reply_text(help_text, parse_mode="Markdown")
