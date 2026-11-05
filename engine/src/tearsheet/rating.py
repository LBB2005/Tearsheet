"""Buy, Hold or Sell against the peer group (design item 28, Technical Plan §7).

The gap percentile is where the company's value gap (its value-gap part ÷ its price) ranks
among its peers' value gaps, the company not counted. Buy needs the gap percentile at or above
the Buy line for its uncertainty level and the score at or above the 60th percentile; Sell
needs both at or below their lines. Red flags then cap the rating at Hold. With fewer than 15
valued peers the rating is withheld; with no valid valuation it is Hold, with no range, gap
percentile, probability or trigger prices.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from tearsheet.scoring import percentile
from tearsheet.valuation.common import median

NOT_REACHABLE = "not reachable by price alone"


@dataclass(frozen=True)
class PeerGap:
    cik: int
    gap: float


@dataclass(frozen=True)
class RatingInputs:
    price: float
    value: float | None
    score: float
    uncertainty: str
    peer_gaps: list[PeerGap]
    red_flags: list[str]
    volatility: float


@dataclass(frozen=True)
class Rating:
    rating: str | None  # None when withheld
    uncapped: str | None
    gap: float | None
    gap_percentile: float | None
    probability: float | None
    triggers: dict[str, Any] = field(default_factory=dict)
    lines: dict[str, float] = field(default_factory=dict)
    withheld: str | None = None


def value_gap(*, price: float, value: float, years: float = 3) -> float:
    return (value - price) / years / price


def gap_percentile(gap: float, peer_gaps: list[float]) -> float:
    """Ranked among the peer gaps only (item 26's formula, the company not in the set)."""
    return percentile(gap, peer_gaps)


def rule(
    gap_pct: float, score: float, *, buy_line: float, sell_line: float, score_lines: dict[str, Any]
) -> str:
    if gap_pct >= buy_line and score >= float(score_lines["buy"]):
        return "Buy"
    if gap_pct <= sell_line and score <= float(score_lines["sell"]):
        return "Sell"
    return "Hold"


def trigger_prices(
    *, value: float, peer_gaps: list[float], buy_line: float, sell_line: float, years: float = 3
) -> dict[str, float]:
    """The prices where the gap condition changes, holding the score and the peer gaps fixed.

    Sort the n peer gaps. Buy: the smallest k with 100k/n ≥ L; the gap must rise above the k-th.
    Sell: the largest k with 100k/n ≤ S; the gap must fall below the (k+1)-th. A target gap g
    is reached at price V ÷ (1 + years × g).
    """
    gaps = sorted(peer_gaps)
    n = len(gaps)
    out = {}
    k_buy = next((k for k in range(1, n + 1) if 100 * k / n >= buy_line), None)
    if k_buy is not None:
        out["buy"] = value / (1 + years * gaps[k_buy - 1])
    k_sell = max((k for k in range(0, n) if 100 * k / n <= sell_line), default=None)
    if k_sell is not None and k_sell < n:
        out["sell"] = value / (1 + years * gaps[k_sell])
    return out


def probability(
    *, gap: float, peer_median_gap: float, volatility: float, rules: dict[str, Any]
) -> float:
    """The internal probability of beating the peer group: logged and graded, not shown."""
    z = (gap - peer_median_gap) / (volatility * math.sqrt(1 - float(rules["shared_variance"])))
    p = 1 / (1 + math.exp(-z))
    return min(max(p, float(rules["floor"])), float(rules["cap"]))


def rate(r: RatingInputs, lines: dict[str, Any]) -> Rating:
    years = float(lines["range"]["value_gap_years"])
    level_lines = lines["percentile_lines"][r.uncertainty]
    buy_line, sell_line = float(level_lines["buy"]), float(level_lines["sell"])
    used = {"buy": buy_line, "sell": sell_line}
    if r.value is None:
        return Rating("Hold", "Hold", None, None, None, {}, used, None)
    gaps = [p.gap for p in r.peer_gaps]
    if len(gaps) < int(lines["min_valued_peers"]):
        return Rating(
            None,
            None,
            None,
            None,
            None,
            {},
            used,
            f"only {len(gaps)} peers have a valid valuation; a rating needs {lines['min_valued_peers']}",
        )
    gap = value_gap(price=r.price, value=r.value, years=years)
    pct = gap_percentile(gap, gaps)
    uncapped = rule(
        pct, r.score, buy_line=buy_line, sell_line=sell_line, score_lines=lines["score_lines"]
    )
    rating = "Hold" if r.red_flags and uncapped != "Hold" else uncapped
    prices = trigger_prices(
        value=r.value, peer_gaps=gaps, buy_line=buy_line, sell_line=sell_line, years=years
    )
    triggers: dict[str, Any] = {
        "buy": prices.get("buy")
        if r.score >= float(lines["score_lines"]["buy"])
        else NOT_REACHABLE,
        "sell": prices.get("sell")
        if r.score <= float(lines["score_lines"]["sell"])
        else NOT_REACHABLE,
    }
    prob = probability(
        gap=gap, peer_median_gap=median(gaps), volatility=r.volatility, rules=lines["probability"]
    )
    return Rating(rating, uncapped, gap, pct, prob, triggers, used, None)


def peer_mix(
    gaps: dict[int, float],
    scores: dict[int, float],
    uncertainty: dict[int, str],
    lines: dict[str, Any],
) -> dict[str, int]:
    """Each member rated with the same rule, its gap ranked among the other valid gaps, before
    red-flag caps (which would need each peer's filings)."""
    mix = {"Buy": 0, "Hold": 0, "Sell": 0}
    for cik, gap in gaps.items():
        if cik not in scores or cik not in uncertainty:
            continue
        others = [g for other, g in gaps.items() if other != cik]
        if not others:
            continue
        level = lines["percentile_lines"][uncertainty[cik]]
        result = rule(
            gap_percentile(gap, others),
            scores[cik],
            buy_line=float(level["buy"]),
            sell_line=float(level["sell"]),
            score_lines=lines["score_lines"],
        )
        mix[result] += 1
    return mix
