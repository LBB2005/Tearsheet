"""Residual income, peer multiples and the financials rules (design item 27)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from tearsheet.methodology import load
from tearsheet.valuation.common import GroupStats
from tearsheet.valuation.financials import methods_for, price_to_ffo
from tearsheet.valuation.multiples import harmonic_trimmed, multiples
from tearsheet.valuation.residual_income import residual_income
from tests.test_valuation import COMPANY

SETTINGS = load().valuation
BANK = replace(COMPANY, common_equity=600.0, return_on_equity=0.15, payout=0.4, diluted_eps=9.0)


def ri_by_hand(bv0, roe0, median_roe, payout, coe, shares, years=10):
    bv, value = bv0, bv0
    for t in range(1, years + 1):
        roe = roe0 + (median_roe - roe0) * t / years
        value += (roe - coe) * bv / (1 + coe) ** t
        bv = bv * (1 + roe * (1 - payout))
    return value / shares


def test_residual_income_matches_the_formulas_by_hand():
    stats = GroupStats(median_return_on_equity=0.10)
    result = residual_income(BANK, stats, cost_of_equity=0.09, settings=SETTINGS)
    assert result.valid
    assert result.value == pytest.approx(ri_by_hand(600.0, 0.15, 0.10, 0.4, 0.09, 10.0))


def test_residual_income_is_not_meaningful_without_book_value():
    result = residual_income(
        replace(BANK, common_equity=-5.0),
        GroupStats(median_return_on_equity=0.1),
        cost_of_equity=0.09,
        settings=SETTINGS,
    )
    assert not result.valid and "book value" in result.reason


def test_payout_is_kept_between_0_and_1():
    stats = GroupStats(median_return_on_equity=0.10)
    high = residual_income(replace(BANK, payout=1.7), stats, cost_of_equity=0.09, settings=SETTINGS)
    assert high.value == pytest.approx(ri_by_hand(600.0, 0.15, 0.10, 1.0, 0.09, 10.0))


def test_the_trimmed_harmonic_mean_drops_non_positive_first():
    values = [-3.0, 0.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 28.0, 200.0]
    mean, kept = harmonic_trimmed(values, trim_share=0.10)
    # 11 positive values; 10% of 11 rounded down is 1 from each end: 10.0 and 200.0 go.
    assert kept == [12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 28.0]
    assert mean == pytest.approx(len(kept) / sum(1 / v for v in kept))


def peers(n, pe=20.0, ev_ebit=15.0):
    out = []
    for i in range(n):
        p = replace(
            COMPANY,
            cik=100 + i,
            price=100.0,
            diluted_eps=100.0 / (pe + i),
            ebit=1.0,
            market_value=1_000.0,
        )
        ev = p.market_value + (p.total_debt or 0) + (p.lease_liabilities or 0) - (p.cash or 0)
        out.append(replace(p, ebit=ev / (ev_ebit + i)))
    return out


def test_multiples_use_both_pe_and_ev_ebit():
    group = peers(10)
    company = replace(COMPANY, diluted_eps=5.0)
    result = multiples(company, group, settings=SETTINGS)
    pe, _ = harmonic_trimmed([p.price / p.diluted_eps for p in group], trim_share=0.10)
    assert result.details["pe_value"] == pytest.approx(pe * 5.0)
    assert result.valid and result.value == pytest.approx(
        (result.details["pe_value"] + result.details["ev_ebit_value"]) / 2
    )


def test_multiples_need_5_peers_and_positive_company_earnings():
    assert not multiples(replace(COMPANY, diluted_eps=5.0), peers(4), settings=SETTINGS).valid
    no_eps = multiples(replace(COMPANY, diluted_eps=-1.0), peers(10), settings=SETTINGS)
    assert no_eps.valid and no_eps.details["pe_value"] is None  # EV/EBIT alone still counts


def test_banks_and_insurers_use_residual_income_and_pe():
    names = methods_for("bank")
    assert names == ("residual_income", "pe")
    assert methods_for("") == ("dcf", "residual_income", "multiples")
    assert methods_for("reit") == ("residual_income", "price_to_ffo")


def test_price_to_ffo_against_the_reits_in_the_group():
    reits = [(100.0, 100.0 / (12 + i)) for i in range(6)]  # (price, FFO per share)
    value = price_to_ffo(ffo_per_share=5.0, reit_peers=reits, settings=SETTINGS)
    mean, _ = harmonic_trimmed([p / f for p, f in reits], trim_share=0.10)
    assert value.valid and value.value == pytest.approx(mean * 5.0)
    assert "approximation" in value.details["note"]
    assert not price_to_ffo(ffo_per_share=5.0, reit_peers=reits[:4], settings=SETTINGS).valid
