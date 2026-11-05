"""Peer groups, the percentile formula, factor scores and momentum scaling (items 24 and 26)."""

from __future__ import annotations

import math
from datetime import date

import pytest

from tearsheet.data.membership import HoldingRow, Holdings
from tearsheet.methodology import load
from tearsheet.metrics import Metric
from tearsheet.peers import build_peer_group
from tearsheet.scoring import (
    SLICE_METRICS,
    MomentumScaling,
    momentum_scaling,
    percentile,
    score_group,
)

METHOD = load()


def holdings(n: int, sector: str = "Information Technology") -> Holdings:
    rows = [HoldingRow(f"T{i}", 1000 + i, f"Co {i}", sector, float(100 - i)) for i in range(n)]
    rows.append(HoldingRow("OTHER", 5000, "Other", "Energy", 50.0))
    return Holdings(as_of=date(2026, 11, 3), source="bundled", rows=rows)


# --- peers ------------------------------------------------------------------------------


def test_the_peer_group_is_the_40_largest_without_the_company():
    group = build_peer_group(holdings(60), 1005, cap=40, trend=3)
    assert len(group.peers) == 40
    assert 1005 not in group.peers
    assert group.peers[:3] == [1000, 1001, 1002] == group.trend_peers
    assert (
        group.peers[-1] == 1040
    )  # the company's slot isn't refilled... it's the 41st largest overall
    assert group.weight == pytest.approx(1 / 40)


def test_a_left_out_peer_is_not_replaced():
    group = build_peer_group(holdings(60), 1005, cap=40, trend=3)
    smaller = group.leave_out(1010, "stale prices")
    assert len(smaller.peers) == 39 and 1010 not in smaller.peers
    assert smaller.left_out == {1010: "stale prices"}
    assert smaller.weight == pytest.approx(1 / 39)
    assert 1041 not in smaller.peers


# --- percentiles --------------------------------------------------------------------------


def test_the_percentile_formula_with_ties():
    values = [1.0, 2.0, 2.0, 3.0]
    assert percentile(2.0, values) == pytest.approx(100 * (1 + 0.5 * 2) / 4)
    assert percentile(3.0, values) == pytest.approx(100 * (3 + 0.5) / 4)
    assert percentile(1.0, values) == pytest.approx(100 * 0.5 / 4)


def test_lower_is_better_reverses_the_rank():
    values = [1.0, 2.0, 3.0]
    assert percentile(1.0, values, higher_is_better=False) == pytest.approx(100 * 2.5 / 3)


def test_infinite_values_rank_at_the_ends():
    values = [1.0, 2.0, math.inf]
    assert percentile(math.inf, values) == pytest.approx(
        100 * 2.5 / 3
    )  # best when higher is better
    assert percentile(math.inf, values, higher_is_better=False) == pytest.approx(100 * 0.5 / 3)


# --- factor scores ----------------------------------------------------------------------------


def group_metrics(n: int = 5, *, drop: dict[str, set[int]] | None = None):
    """Member i has value i for every slice metric, so higher i is better on 'higher' metrics."""
    drop = drop or {}
    out = {}
    for i in range(n):
        out[i] = {
            name: Metric(name, None if i in drop.get(name, set()) else float(i), {})
            for name in SLICE_METRICS
        }
    return out


def test_scores_are_percentiles_in_the_group():
    result = score_group(
        group_metrics(),
        METHOD.weights,
        metric_set=SLICE_METRICS,
        scaling=MomentumScaling(False, "off"),
    )
    assert set(result.composite) == set(range(5))
    assert 0 < result.composite[0] < 100
    momentum = result.factors[4]["momentum"]
    assert momentum == pytest.approx(percentile(4.0, [0, 1, 2, 3, 4]))


def test_a_missing_metric_passes_its_factor_weight_on():
    result = score_group(
        group_metrics(drop={"momentum_12m": {2}}),
        METHOD.weights,
        metric_set=SLICE_METRICS,
        scaling=MomentumScaling(False, "off"),
    )
    weights = result.weights_used[2]
    assert "momentum" not in weights
    assert sum(weights.values()) == pytest.approx(1.0)
    assert weights["profitability"] == pytest.approx(0.30 / 0.75)


def test_momentum_scaling_halves_the_momentum_weight():
    result = score_group(
        group_metrics(),
        METHOD.weights,
        metric_set=SLICE_METRICS,
        scaling=MomentumScaling(True, "on"),
    )
    weights = result.weights_used[0]
    assert weights["momentum"] == pytest.approx(0.125 / 0.875)
    assert sum(weights.values()) == pytest.approx(1.0)


def spy_returns(days: int, *, crash: bool) -> tuple[list[float], float]:
    calm = [0.001 * (1 if i % 2 else -1) for i in range(days)]
    if crash:
        calm[-21:] = [0.03 * (1 if i % 2 else -1) - 0.004 for i in range(21)]
    return calm, (-0.10 if crash else 0.10)


def test_momentum_scaling_needs_a_falling_market_and_high_volatility():
    returns, yearly = spy_returns(500, crash=True)
    assert momentum_scaling(
        returns, spy_12m_return=yearly, rules=METHOD.weights["momentum_scaling"]
    ).on
    returns, yearly = spy_returns(500, crash=False)
    assert not momentum_scaling(
        returns, spy_12m_return=yearly, rules=METHOD.weights["momentum_scaling"]
    ).on
    returns, _ = spy_returns(500, crash=True)
    assert not momentum_scaling(
        returns, spy_12m_return=0.05, rules=METHOD.weights["momentum_scaling"]
    ).on


def test_momentum_scaling_with_a_short_history():
    returns, yearly = spy_returns(260, crash=True)
    short = momentum_scaling(
        returns, spy_12m_return=yearly, rules=METHOD.weights["momentum_scaling"]
    )
    assert short.on and "260" in short.note
    returns, yearly = spy_returns(200, crash=True)
    off = momentum_scaling(returns, spy_12m_return=yearly, rules=METHOD.weights["momentum_scaling"])
    assert not off.on and "off" in off.note
