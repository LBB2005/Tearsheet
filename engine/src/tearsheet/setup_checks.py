"""First-time setup checks: one real call to prove a pasted key works (never stored here)."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta
from typing import Literal

from tearsheet import config
from tearsheet.data.fred import fetch_series, value_on
from tearsheet.data.prices import ms_to_eastern_date
from tearsheet.http import EASTERN, MASSIVE_AUTH_HEADER, HttpClient, HTTPFailure, InvalidResponse
from tearsheet.server import EngineError

# What Massive's own error text says when the key is the problem.
KEY_WORDS = ("not_authorized", "unauthorized", "api key", "apikey", "invalid key")
KEY_PROBLEM_STATUSES = {"massive": {401, 403}, "fred": {401, 403, 400}}
NAMES = {"massive": "Massive", "fred": "FRED"}


async def check_key(http: HttpClient, service: Literal["massive", "fred"], key: str) -> str:
    """Make one call with `key` and return the proof line. The key is not saved or logged."""
    key = key.strip()
    if not key:
        raise EngineError("KEY_REJECTED", f"Paste your {NAMES[service]} key first.")
    try:
        if service == "massive":
            return await _check_massive(http, key)
        return await _check_fred(http, key)
    except EngineError:
        raise
    except HTTPFailure as exc:
        name = NAMES[service]
        says_key = (
            isinstance(exc, InvalidResponse)
            and service == "massive"
            and any(word in str(exc).lower() for word in KEY_WORDS)
        )
        if exc.status in KEY_PROBLEM_STATUSES[service] or says_key:
            raise EngineError(
                "KEY_REJECTED", f"{name} didn't accept that key. Check it and paste it again."
            ) from None
        raise EngineError(
            "SERVICE_UNREACHABLE",
            f"Couldn't reach {name} just now. Check your connection and try again.",
        ) from None


async def _check_massive(http: HttpClient, key: str) -> str:
    # Use the pasted key for this one client only.
    svc = http.services["massive"]
    http.services["massive"] = replace(svc, headers={MASSIVE_AUTH_HEADER: f"Bearer {key}"})
    today = datetime.now(EASTERN).date()
    fetched = await http.fetch(
        "massive",
        config.MASSIVE_BASE_URL
        + config.MASSIVE_DAILY_BARS.format(
            ticker="SPY", start=(today - timedelta(days=10)).isoformat(), end=today.isoformat()
        ),
        kind="key_check",
        params={"adjusted": "false", "sort": "desc", "limit": "5"},
    )
    rows = [b for b in fetched.json().get("results") or [] if b.get("c") is not None]
    if not rows:
        raise EngineError("SERVICE_UNREACHABLE", "Massive answered but sent no SPY prices.")
    latest = max(rows, key=lambda b: b["t"])
    day = ms_to_eastern_date(latest["t"])
    return f"Works. SPY closed at ${float(latest['c']):,.2f} on {day:%b} {day.day}."


async def _check_fred(http: HttpClient, key: str) -> str:
    today = datetime.now(EASTERN).date()
    series = await fetch_series(http, "DGS10", api_key=key, start=today - timedelta(days=30))
    latest = value_on(series, today)
    if latest is None:
        raise EngineError("SERVICE_UNREACHABLE", "FRED answered but sent no yield values.")
    return f"Works. The 10-year Treasury yield is {latest[1]:g}%."
