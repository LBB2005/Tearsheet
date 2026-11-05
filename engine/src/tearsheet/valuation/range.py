"""The 12-month range and the uncertainty level (design item 28, Technical Plan §7).

Base case = price × (1 + cost of equity − dividend yield) + one-third × (value − price). Bear and
bull are the 10th and 90th percentiles of a lognormal spread around it, from the stock's
12-month volatility moved halfway toward the peer median.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

UNCERTAINTY_TRIGGERS = ("terminal_share", "method_spread", "one_method", "negative_free_cash_flow")


@dataclass(frozen=True)
class RangeInputs:
    price: float
    value: float | None
    cost_of_equity: float
    dividend_yield: float
    volatility: float  # the stock's annualized 12-month volatility
    peer_median_volatility: float | None


@dataclass(frozen=True)
class Range:
    bear: float
    base: float
    bull: float
    volatility: float  # the forecast used for the spread


def twelve_month_range(r: RangeInputs, lines: dict[str, Any]) -> Range | None:
    if r.value is None:
        return None
    rules = lines["range"]
    base = r.price * (1 + r.cost_of_equity - r.dividend_yield) + (r.value - r.price) / float(
        rules["value_gap_years"]
    )
    vol = r.volatility
    if r.peer_median_volatility is not None:
        vol = vol + (r.peer_median_volatility - vol) * float(rules["peer_volatility_blend"])
    z = float(rules["z_10_90"])
    return Range(base * math.exp(-z * vol), base, base * math.exp(z * vol), vol)


def uncertainty_level(volatility: float, triggers: list[str], lines: dict[str, Any]) -> str:
    levels = list(lines["uncertainty_levels"])
    start = levels[-2]
    for row in lines["volatility_cutoffs"]:
        if row["below"] is None or volatility < float(row["below"]):
            start = row["level"]
            break
    i = levels.index(start) + len([t for t in triggers if t in UNCERTAINTY_TRIGGERS])
    return levels[min(i, len(levels) - 1)]
