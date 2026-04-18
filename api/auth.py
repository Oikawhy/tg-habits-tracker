"""
PlanHabits API — Telegram initData authentication.
Verifies HMAC-SHA256 signature from Telegram WebApp.
"""

import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
from typing import Optional

from fastapi import Request, HTTPException, Depends

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Internal API key — MUST be set via env var in production.
# If BOT_TOKEN is set (production), missing key is a fatal error.
# If BOT_TOKEN is empty (dev mode), generate ephemeral key for local testing.
_configured_key = os.getenv("INTERNAL_API_KEY", "")
if _configured_key:
    INTERNAL_API_KEY = _configured_key
elif BOT_TOKEN:
    import sys
    import logging
    logging.getLogger(__name__).critical(
        "INTERNAL_API_KEY is not set but BOT_TOKEN is configured! "
        "The bot cannot authenticate with the API without a shared key. "
        "Generate one with: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\" "
        "and add it to .env"
    )
    sys.exit(1)
else:
    INTERNAL_API_KEY = secrets.token_urlsafe(32)
    import logging
    logging.getLogger(__name__).warning(
        "INTERNAL_API_KEY not set (dev mode). Generated ephemeral key: %s",
        INTERNAL_API_KEY
    )


async def verify_telegram_auth(request: Request) -> int:
    """Extract and verify user_id from Telegram initData header.

    Does NOT accept internal key — use verify_internal_auth for bot endpoints.
    Falls back to query param user_id ONLY if BOT_TOKEN is empty (dev mode).
    """
    # 1. Check Telegram initData header
    init_data = request.headers.get("X-Telegram-InitData", "")

    if init_data:
        return _verify_init_data(init_data)

    # 2. Dev fallback — only when BOT_TOKEN is not set
    if not BOT_TOKEN:
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id)

    raise HTTPException(401, "Authentication required")


async def verify_internal_auth(request: Request) -> int:
    """Authenticate bot-to-API internal calls via X-Internal-Key.

    Only used for endpoints the bot needs (users, stats, entries, freezes).
    Does NOT fall back to user-facing auth.
    """
    internal_key = request.headers.get("X-Internal-Key", "")
    if not internal_key:
        raise HTTPException(401, "Internal authentication required")

    if not hmac.compare_digest(internal_key, INTERNAL_API_KEY):
        raise HTTPException(403, "Invalid internal key")

    # Trust user_id from query for internal calls
    user_id = request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(400, "Missing user_id for internal call")

    return int(user_id)


async def verify_telegram_or_internal(request: Request) -> int:
    """Accept either Telegram initData OR internal key.

    Used for endpoints that both the webapp and the bot need access to
    (e.g. GET /entries, GET /stats).
    """
    # Try internal key first (bot calls)
    internal_key = request.headers.get("X-Internal-Key", "")
    if internal_key:
        if not hmac.compare_digest(internal_key, INTERNAL_API_KEY):
            raise HTTPException(403, "Invalid internal key")
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id)
        raise HTTPException(400, "Missing user_id for internal call")

    # Try Telegram initData (webapp calls)
    init_data = request.headers.get("X-Telegram-InitData", "")
    if init_data:
        return _verify_init_data(init_data)

    # Dev fallback
    if not BOT_TOKEN:
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id)

    raise HTTPException(401, "Authentication required")


async def verify_telegram_or_internal_with_source(request: Request) -> tuple[int, bool]:
    """Like verify_telegram_or_internal but also returns whether auth was internal.

    Returns (user_id, is_internal). Endpoints that need different behavior
    for webapp vs bot callers (e.g. self-only access) should use this.
    """
    # Try internal key first (bot calls)
    internal_key = request.headers.get("X-Internal-Key", "")
    if internal_key:
        if not hmac.compare_digest(internal_key, INTERNAL_API_KEY):
            raise HTTPException(403, "Invalid internal key")
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id), True
        raise HTTPException(400, "Missing user_id for internal call")

    # Try Telegram initData (webapp calls)
    init_data = request.headers.get("X-Telegram-InitData", "")
    if init_data:
        return _verify_init_data(init_data), False

    # Dev fallback
    if not BOT_TOKEN:
        user_id = request.query_params.get("user_id")
        if user_id:
            return int(user_id), False

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
