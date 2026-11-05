"""The composite score (design item 26, Technical Plan §7).

Every metric is ranked as a percentile among the company and its peers that have a valid
value. A factor is the average of its metrics' percentiles; a missing metric is left out, and
a factor with no valid metric passes its weight to the others in proportion. The composite is
the weighted sum of the factors, re-ranked as a percentile within the group, so "60th
percentile" always means "against its peers."
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Any

from tearsheet.metrics import DIRECTION, Metric

# Phase 1a's thin slice uses one metric per factor (design, Phase 1a).
SLICE_METRICS = (
    "operating_margin",
    "momentum_12m",
    "earnings_yield",
    "net_share_issuance",
    "net_debt_to_ebitda",
    "accruals_to_assets",
)


def percentile(x: float, values: list[float], *, higher_is_better: bool = True) -> float:
    """100 × (the number of values below x + 0.5 × the number equal to x) ÷ n. When x is itself
    in the set it counts among the equal values. For lower-is-better values, signs are reversed."""
    if not higher_is_better:
        x, values = -x, [-v for v in values]
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100.0 * (below + 0.5 * equal) / len(values)


@dataclass(frozen=True)
class MomentumScaling:
    on: bool
    note: str
    spy_12m_return: float | None = None
    volatility_percentile: float | None = None


def momentum_scaling(
    spy_log_returns: list[float], *, spy_12m_return: float | None, rules: dict[str, Any]
) -> MomentumScaling:
    """Momentum's weight is halved when SPY's 12-month return is negative and its 1-month
    volatility is in the top fifth of its recent history (item 26)."""
    days = len(spy_log_returns)
    window = int(rules["volatility_days"])
    if days < int(rules["min_history_days"]) or spy_12m_return is None:
        return MomentumScaling(
            False,
            f"Momentum scaling is off: only {days} trading days of SPY prices are stored, and it needs {rules['min_history_days']}.",
        )
    history = min(days, int(rules["history_days"]))
    series = (
        spy_log_returns[-(history + window - 1) :]
        if days >= history + window - 1
        else spy_log_returns
    )
    vols = [
        statistics.pstdev(series[i - window : i]) * math.sqrt(252)
        for i in range(window, len(series) + 1)
    ]
    current = vols[-1]
    rank = percentile(current, vols)
    on = spy_12m_return < 0 and rank >= float(rules["top_percentile"])
    note = (
        f"Momentum scaling used {history} trading days of SPY history (fewer than {rules['history_days']})."
        if history < int(rules["history_days"])
        else None
    )
    state = "on" if on else "off"
    return MomentumScaling(on, note or f"Momentum scaling is {state}.", spy_12m_return, rank)


@dataclass
class ScoreResult:
    composite: dict[int, float]  # percentile in the group
    raw: dict[int, float]  # weighted sum before re-ranking
    factors: dict[int, dict[str, float]]
    metric_percentiles: dict[int, dict[str, float]]
    weights_used: dict[int, dict[str, float]]
    scaling: MomentumScaling
    metric_set: tuple[str, ...] = field(default_factory=tuple)


def _factor_metrics(
    weights: dict[str, Any], metric_set: tuple[str, ...] | None, financial: bool
) -> dict[str, list[str]]:
    out = {}
    for name, factor in weights["factors"].items():
        metrics = list(factor["metrics"])
        if name == "profitability" and financial:
            metrics = list(weights.get("financials_profitability", ["return_on_equity"]))
        if metric_set is not None:
            metrics = [m for m in metrics if m in metric_set] or (
                [m for m in metric_set if m in factor["metrics"]] if not financial else metrics
            )
        out[name] = metrics
    return out


def score_group(
    metrics: dict[int, dict[str, Metric]],
    weights: dict[str, Any],
    *,
    metric_set: tuple[str, ...] | None = None,
    scaling: MomentumScaling,
    financial_members: set[int] | None = None,
) -> ScoreResult:
    """Score every member of a peer group (the company and its peers) against the same set.

    `financial_members` are banks and insurers, whose profitability factor is return on
    equity (ranked against every member's return on equity)."""
    financial_members = financial_members or set()
    members = list(metrics)
    base = {name: float(f["weight"]) for name, f in weights["factors"].items()}
    if scaling.on:
        base["momentum"] *= float(weights["momentum_scaling"]["weight_multiplier"])

    # Percentile of every metric among the members with a valid value.
    names = {n for per in metrics.values() for n in per}
    pct: dict[int, dict[str, float]] = {cik: {} for cik in members}
    for name in names:
        valid = {
            cik: metrics[cik][name].value
            for cik in members
            if name in metrics[cik] and metrics[cik][name].value is not None
        }
        values = list(valid.values())
        for cik, value in valid.items():
            pct[cik][name] = percentile(value, values, higher_is_better=DIRECTION[name] == "higher")

    factors: dict[int, dict[str, float]] = {}
    used: dict[int, dict[str, float]] = {}
    raw: dict[int, float] = {}
    for cik in members:
        plan = _factor_metrics(weights, metric_set, cik in financial_members)
        scores = {}
        for factor, names_ in plan.items():
            have = [pct[cik][n] for n in names_ if n in pct[cik]]
            if have:
                scores[factor] = sum(have) / len(have)
        total = sum(base[f] for f in scores)
        w = {f: base[f] / total for f in scores} if total else {}
        factors[cik], used[cik] = scores, w
        raw[cik] = sum(scores[f] * w[f] for f in scores) if scores else math.nan

    scored = {cik: v for cik, v in raw.items() if not math.isnan(v)}
    composite = {cik: percentile(v, list(scored.values())) for cik, v in scored.items()}
    return ScoreResult(composite, raw, factors, pct, used, scaling, tuple(metric_set or ()))
