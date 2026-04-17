"""
PlanHabits API — Telegram initData authentication.
Verifies HMAC-SHA256 signature from Telegram WebApp.
"""

import hashlib
import hmac
import json
import os
import time
import urllib.parse
from typing import Optional

from fastapi import Request, HTTPException, Depends

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Internal API key for bot-to-API calls (not user-facing)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "planhabits-internal-key-2026")


async def verify_telegram_auth(request: Request) -> int:
    """Extract and verify user_id from Telegram initData header.
    
    For internal bot calls, accepts X-Internal-Key header instead.
    Falls back to query param user_id ONLY if BOT_TOKEN is empty (dev mode).
    """
    # 1. Check for internal API key (bot-to-API calls)
    internal_key = request.headers.get("X-Internal-Key", "")
    if internal_key and hmac.compare_digest(internal_key, INTERNAL_API_KEY):
        # Internal call — trust user_id from query
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id)
        raise HTTPException(400, "Missing user_id for internal call")

    # 2. Check Telegram initData header
    init_data = request.headers.get("X-Telegram-InitData", "")
    
    if init_data:
        return _verify_init_data(init_data)
    
    # 3. Dev fallback — only when BOT_TOKEN is not set
    if not BOT_TOKEN:
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id)

    raise HTTPException(401, "Authentication required")


def _verify_init_data(init_data: str) -> int:
    """Verify Telegram WebApp initData HMAC-SHA256 signature."""
    try:
        parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        raise HTTPException(403, "Malformed initData")

    check_hash = parsed.pop("hash", "")
    if not check_hash:
        raise HTTPException(403, "Missing hash in initData")

    # Build data-check-string (sorted alphabetically)
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )

    # HMAC-SHA256: secret = HMAC("WebAppData", bot_token)
    secret = hmac.new(
        b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    
    computed = hmac.new(
        secret, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed, check_hash):
        raise HTTPException(403, "Invalid initData signature")

    # Check auth_date freshness (allow 24h for clock drift)
    auth_date = int(parsed.get("auth_date", "0"))
    if auth_date and (time.time() - auth_date) > 86400:
        raise HTTPException(403, "initData expired")

    # Extract user
    user_json = parsed.get("user", "{}")
    try:
        user = json.loads(user_json)
    except json.JSONDecodeError:
        raise HTTPException(403, "Invalid user data in initData")

    user_id = user.get("id")
    if not user_id:
        raise HTTPException(403, "No user ID in initData")

    return int(user_id)
