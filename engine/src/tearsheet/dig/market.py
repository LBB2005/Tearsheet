"""The market part: SPY's 12-month total return, its 1-month volatility against its recent
history and whether the method's momentum scaling would be on, plus the FRED figures that
report section 8 uses."""

from __future__ import annotations

from datetime import date
from typing import Any

from tearsheet.charts import SPY_CIK
from tearsheet.data.prices import PriceStore
from tearsheet.pipeline import twelve_month_return
from tearsheet.report_numbers import FRED_LABELS
from tearsheet.scoring import momentum_scaling


def market_part(prices: PriceStore, rules: dict[str, Any], *, up_to: date) -> dict[str, Any]:
    """`rules` is the methodology's momentum_scaling block. Reads prices up to `up_to` only."""
    if not prices.closes(SPY_CIK, up_to=up_to):
        return {"state": "down", "note": "No stored SPY prices yet."}
    year = twelve_month_return(prices, SPY_CIK, up_to)
    scaling = momentum_scaling(
        prices.log_returns(SPY_CIK, up_to=up_to), spy_12m_return=year, rules=rules
    )
    return {
        "state": "ok",
        "note": None,
        "spy_12m": year,
        "volatility_percentile": scaling.volatility_percentile,
        "scaling_on": scaling.on,
        "scaling_note": scaling.note,
    }


def rates_part(
    macro: dict[str, tuple[str, float, date]] | None, *, fred_key: bool
) -> dict[str, Any]:
    """`macro` is LiveData.macro's answer, None when FRED failed."""
    if not fred_key:
        return {"state": "off", "note": "Add a FRED key in Settings to see rates.", "rates": []}
    if macro is None:
        return {"state": "down", "note": "FRED didn't answer.", "rates": []}
    rates = [
        {"id": sid, "label": label, "value": macro[sid][1], "date": macro[sid][2].isoformat()}
        for sid, label in FRED_LABELS.items()
        if sid in macro
    ]
    return {"state": "ok", "note": None, "rates": rates}
