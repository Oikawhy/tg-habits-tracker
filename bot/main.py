"""
PlanHabits Bot — Telegram bot entry point.
Handles /start, weekly stats push, and habit reminders.
"""

import os
import logging
from datetime import time, datetime

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes

from handlers.start import start_command, help_command, weekly_stats_callback
from handlers.reminders import setup_reminders
from services.stats_reporter import send_weekly_stats, reset_freezes

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_URL = os.getenv("API_URL", "http://api:8000")


def main():
    """Start the bot."""
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN environment variable is not set!")
        return

    app = ApplicationBuilder().token(BOT_TOKEN).build()

    # Command handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))

    # Callback query handler for Weekly Stats button
    app.add_handler(CallbackQueryHandler(weekly_stats_callback, pattern="^weekly_stats$"))

    # Schedule weekly stats push — Sunday at 20:00 UTC
    job_queue = app.job_queue
    if job_queue:
        # Sunday weekly stats at 20:00
        job_queue.run_daily(
            send_weekly_stats,
            time=time(hour=20, minute=0),
            days=(6,),  # Sunday = 6 in python-telegram-bot
            name="weekly_stats"
        )

        # Reset streak freezes on Monday at 00:00
        job_queue.run_daily(
            reset_freezes,
            time=time(hour=0, minute=0),
            days=(0,),  # Monday = 0
            name="reset_freezes"
        )

        # Check and send reminders every 5 minutes
        job_queue.run_repeating(
            setup_reminders,
            interval=300,  # 5 minutes
            first=10,
            name="reminders"
        )

        logger.info("Job queue configured: weekly stats, freeze reset, reminders")

    logger.info("PlanHabits Bot started!")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
