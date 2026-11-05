"""Peer multiples (design item 27, Technical Plan §8).

P/E: each peer's price ÷ its diluted earnings per share; peers with earnings of zero or below
are dropped first, then the top and bottom 10% of the rest (rounded down). The harmonic mean
of the rest × the company's earnings per share is the P/E value. EV/EBIT follows the same
steps, and its result × the company's EBIT, minus the DCF's bridge items, ÷ shares is the
EV/EBIT value. Each is valid with at least 5 peers left and the company's own figure above
zero. The method value is the mean of the valid ones.
"""

from __future__ import annotations

from typing import Any

from tearsheet.valuation.common import MethodValue, ValuationInputs

METHOD = "multiples"


def harmonic_trimmed(values: list[float], *, trim_share: float) -> tuple[float | None, list[float]]:
    positive = sorted(v for v in values if v > 0)
    cut = int(len(positive) * trim_share)
    kept = positive[cut : len(positive) - cut] if cut else positive
    if not kept:
        return None, []
    return len(kept) / sum(1 / v for v in kept), kept


def enterprise_value(c: ValuationInputs) -> float:
    return (
        c.market_value
        + (c.total_debt or 0.0)
        + (c.lease_liabilities or 0.0)
        + (c.minority_interest or 0.0)
        + (c.preferred_stock or 0.0)
        - (c.cash or 0.0)
    )


def _pe(
    company: ValuationInputs, peers: list[ValuationInputs], trim: float, minimum: int
) -> tuple[float | None, int]:
    ratios = [p.price / p.diluted_eps for p in peers if p.diluted_eps and p.diluted_eps > 0]
    mean, kept = harmonic_trimmed(ratios, trim_share=trim)
    if mean is None or len(kept) < minimum or not company.diluted_eps or company.diluted_eps <= 0:
        return None, len(kept)
    return mean * company.diluted_eps, len(kept)


def _ev_ebit(
    company: ValuationInputs, peers: list[ValuationInputs], trim: float, minimum: int
) -> tuple[float | None, int]:
    ratios = [enterprise_value(p) / p.ebit for p in peers if p.ebit and p.ebit > 0]
    mean, kept = harmonic_trimmed(ratios, trim_share=trim)
    if mean is None or len(kept) < minimum or not company.ebit or company.ebit <= 0:
        return None, len(kept)
    equity = company.equity_bridge(mean * company.ebit)
    return (equity / company.shares if equity > 0 else None), len(kept)


def multiples(
    company: ValuationInputs,
    peers: list[ValuationInputs],
    *,
    settings: dict[str, Any],
    pe_only: bool = False,
) -> MethodValue:
    rules = settings["multiples"]
    trim, minimum = float(rules["trim_share"]), int(rules["min_peers"])
    others = [p for p in peers if p.cik != company.cik]
    pe, pe_n = _pe(company, others, trim, minimum)
    ev, ev_n = (None, 0) if pe_only else _ev_ebit(company, others, trim, minimum)
    valid = [v for v in (pe, ev) if v is not None]
    details = {"pe_value": pe, "ev_ebit_value": ev, "pe_peers": pe_n, "ev_ebit_peers": ev_n}
    if not valid:
        return MethodValue(
            "pe" if pe_only else METHOD,
            None,
            f"fewer than {minimum} peers with positive earnings, or the company's own earnings are zero or below",
            details,
        )
    return MethodValue("pe" if pe_only else METHOD, sum(valid) / len(valid), None, details)
