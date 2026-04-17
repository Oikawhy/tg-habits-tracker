# 🎯 PlanHabits — Telegram Habit Tracker

A fully local Telegram Mini App for weekly habit planning with color-coded time blocks, streak tracking, and weekly statistics.

## Features

- 📅 **Daily View** — See today's habits with color-coded timeline blocks
- 🗓 **Day Navigation** — Swipe through the week, see completion per day
- ✅ **Done/Undone** — One-tap habit completion with haptic feedback
- 🎨 **Color System** — Assign vibrant colors to habits, reflected in timeline
- ⏱ **Time Tracking** — Plan and log actual minutes spent per habit
- 📋 **Week Planner** — 7-column grid to assign habits to specific days
- 🔥 **Streaks** — Consecutive day tracking with streak freeze (1/week)
- 🏷️ **Categories** — Group habits by area (Health, Learning, Work, etc.)
- 📊 **Weekly Stats** — Donut chart, per-habit bars, best/worst days
- 📈 **Trend Graphs** — Week-over-week completion rate visualization
- 📅 **Heatmap** — GitHub-style activity grid for the last 3 months
- 🎯 **Weekly Goals** — Set and track completion percentage targets
- ⏰ **Smart Reminders** — Bot sends notifications before habit time slots
- 💬 **Daily Quotes** — Motivational quote rotates daily
- 🌙 **Dark/Light Theme** — Automatically follows Telegram's theme

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot | Python 3.12 + python-telegram-bot v21 |
| API | FastAPI + Uvicorn |
| DB | PostgreSQL 16 |
| Frontend | Vanilla HTML/JS/CSS |
| Charts | Canvas API (no libs) |
| Proxy | Nginx Alpine |
| Container | Docker Compose |

## Quick Start

### 1. Clone & Configure

```bash
cp .env.example .env
# Edit .env with your bot token from @BotFather
```

### 2. Start Services

```bash
docker compose up --build
```

This starts:
- **PostgreSQL** on port 5678
- **FastAPI** on port 8899
- **Nginx** (frontend + proxy) on port 8080
- **Telegram Bot** (polling mode)

### 3. HTTPS for Telegram Mini App

Telegram requires HTTPS for Mini Apps. Options:

**Option A: ngrok (recommended for dev)**
```bash
ngrok http 8080
# Copy the HTTPS URL to .env as WEBAPP_URL
# Restart bot: docker compose restart bot
```

**Option B: Self-signed certificate**
```bash
# Generate certs in nginx/certs/ and update nginx.conf
```

### 4. Configure Bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot: `/newbot`
3. Copy the token to `.env`
4. Set the Mini App URL: `/newapp` → paste your HTTPS URL
5. Send `/start` to your bot

## Project Structure

```
PLANHABITS/
├── docker-compose.yml      # All services
├── .env.example            # Configuration template
├── api/                    # FastAPI backend
│   ├── main.py             # App entry + user endpoints
│   ├── database.py         # PostgreSQL models (SQLAlchemy)
│   ├── models.py           # Pydantic schemas
│   ├── routers/            # REST endpoints
│   └── services/           # Business logic
├── bot/                    # Telegram bot
│   ├── main.py             # Bot entry + scheduler
│   ├── handlers/           # Command handlers
│   └── services/           # Stats reporter
├── webapp/                 # Mini App frontend
│   ├── index.html          # SPA shell
│   ├── css/styles.css      # Full design system
│   ├── js/                 # App logic
│   │   ├── app.js          # Router + init
│   │   ├── api.js          # API client
│   │   ├── screens/        # Screen modules
│   │   └── components/     # UI components
│   └── assets/             # Static assets
└── nginx/                  # Reverse proxy
    └── nginx.conf
```

## API Documentation

Once running, visit: `http://localhost:8899/docs` for interactive Swagger UI.

## License

MIT
