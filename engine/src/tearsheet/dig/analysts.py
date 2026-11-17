"""The analysts part: analystdb's view (consensus, firms, recent changes, the trust check), as
of the snapshot day, beside our own levels. Display here; Phase 2's take reads the same
answers, stored before they are used (AnalystDB.saved_view)."""

from __future__ import annotations

from typing import Any

OURS = ("bear", "base", "bull", "buy_trigger", "sell_trigger")


def analysts_part(view: dict[str, Any], levels_today: dict[str, Any] | None) -> dict[str, Any]:
    """`view` is AnalystDB.saved_view's answer; `levels_today` the target's levels."""
    state = view.get("state")
    if state == "ok":
        part = {"state": "ok", "note": None}
    elif state == "missing":
        part = {"state": "off", "note": "analystdb has no ratings for this company."}
    else:
        part = {"state": "down", "note": "analystdb didn’t answer."}
    ours = {k: levels_today.get(k) for k in OURS} if levels_today else None
    return {**part, "view": view, "ours": ours}
