"""Dig deeper probe: does the saved Massive plan include ticker news?

    uv run --project engine python scripts/phase0/massive_news.py

One call to Massive's news endpoint for AAPL, with the key read from the Keychain and sent
only in the Authorization header. It prints one of:

    news: included
    news: not on this plan
    news: could not check (<why, never the key>)

and, when news is included, whether the answers carry Massive's per-ticker tone. It never
prints, logs or saves the key or the answer: no data folder is opened and nothing is written.

It needs the Massive key: tearsheet-engine set-key massive
"""

from __future__ import annotations

import sys
from typing import Any

import httpx

from tearsheet import config

TICKER = "AAPL"
TIME_LIMIT_S = 20


def verdict(status: int, data: Any) -> list[str]:
    """The lines to print for Massive's answer. Only the status and the answer's shape are
    read: 401 is the key, 403 or NOT_AUTHORIZED ("not entitled") is the plan."""
    body = data if isinstance(data, dict) else {}
    if status == 401:
        return ["news: could not check (Massive refused the saved key)"]
    if status == 403 or body.get("status") == "NOT_AUTHORIZED":
        return ["news: not on this plan"]
    if status == 429:
        return ["news: could not check (too many calls this minute; try again in a minute)"]
    if status != 200 or body.get("status") not in ("OK", "DELAYED"):
        return [f"news: could not check (HTTP {status})"]
    results = body.get("results")
    if not isinstance(results, list):
        return ["news: could not check (the answer had no list of articles)"]
    lines = ["news: included"]
    if not results:
        lines.append("tone: unknown (no articles came back)")
    elif any(isinstance(r, dict) and r.get("insights") for r in results):
        lines.append("tone: included")
    else:
        lines.append("tone: not in the answers")
    return lines


def main() -> int:
    key = config.get_key("massive")
    if not key:
        print("news: could not check (no Massive key saved)")
        return 1
    address = config.MASSIVE_BASE_URL + config.MASSIVE_NEWS
    try:
        # Redirects are not followed, so the key goes to Massive's address and nowhere else.
        response = httpx.get(
            address,
            params={"ticker": TICKER, "limit": 5, "order": "desc", "sort": "published_utc"},
            headers={"Authorization": f"Bearer {key}"},
            timeout=TIME_LIMIT_S,
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        print(f"news: could not check (no answer: {type(exc).__name__})")
        return 1
    finally:
        del key
    try:
        data = response.json()
    except ValueError:
        data = None
    lines = verdict(response.status_code, data)
    print("\n".join(lines))
    return 0 if lines[0] in ("news: included", "news: not on this plan") else 1


if __name__ == "__main__":
    sys.exit(main())
