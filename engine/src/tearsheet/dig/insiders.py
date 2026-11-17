"""The insiders part: open-market buys (code P) and sells (code S) on Form 4 over the last 6
months, with shares and value where the filings give them, and the insiders whose buying
isn't a yearly routine (the report's section 5 test)."""

from __future__ import annotations

from datetime import date
from typing import Any

from tearsheet.data.sec import Form4Trade
from tearsheet.flags import insider_buying_note

INSIDER_DAYS = 183
LISTED = 20


def _side(trades: list[Form4Trade]) -> dict[str, Any]:
    return {
        "trades": len(trades),
        "people": len({t.owner for t in trades}),
        "shares": sum(t.shares for t in trades if t.shares is not None),
        "value": sum(
            t.shares * t.price for t in trades if t.shares is not None and t.price is not None
        ),
    }


def insiders_part(trades: list[Form4Trade] | None, *, today: date) -> dict[str, Any]:
    """`trades` is LiveData.form4_amounts' answer, None when SEC failed."""
    if trades is None:
        return {"state": "down", "note": "SEC didn’t answer."}
    window = [
        t for t in trades if t.code in ("P", "S") and 0 <= (today - t.day).days <= INSIDER_DAYS
    ]
    newest = sorted(window, key=lambda t: t.day, reverse=True)
    note = insider_buying_note(((t.owner, t.day, t.code) for t in trades), today)
    return {
        "state": "ok",
        "note": None,
        "days": INSIDER_DAYS,
        "buys": _side([t for t in window if t.code == "P"]),
        "sells": _side([t for t in window if t.code == "S"]),
        "rows": [
            {
                "owner": t.owner,
                "date": t.day.isoformat(),
                "code": t.code,
                "shares": t.shares,
                "price": t.price,
            }
            for t in newest[:LISTED]
        ],
        "routine_free_buyers": note.buyers if note else [],
    }
