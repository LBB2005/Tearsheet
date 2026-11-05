"""Company lookup and ticker spellings (design item 21)."""

from __future__ import annotations

import pytest

from tearsheet.resolve import (
    NotCovered,
    canonical_ticker,
    resolve,
    sec_ticker_map,
    ticker_for,
)


@pytest.mark.parametrize(
    ("provider", "ticker", "expected"),
    [
        ("sec", "BRK.B", "BRK-B"),
        ("alphavantage", "BRK.B", "BRK-B"),
        ("massive", "BRK.B", "BRK.B"),
        ("ishares", "BRK.B", "BRKB"),
        ("sec", "AAPL", "AAPL"),
        ("ishares", "BF.B", "BFB"),
    ],
)
def test_ticker_spellings(provider, ticker, expected):
    assert ticker_for(provider, ticker) == expected


def test_canonical_form():
    assert canonical_ticker("brk-b") == "BRK.B"
    assert canonical_ticker(" BRK.B ") == "BRK.B"
    assert canonical_ticker("aapl") == "AAPL"


def test_sec_ticker_map():
    tickers_json = {
        "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
        "1": {"cik_str": 1067983, "ticker": "BRK-B", "title": "Berkshire Hathaway"},
    }
    assert sec_ticker_map(tickers_json) == {"AAPL": 320193, "BRK.B": 1067983}


class Holdings:
    """The parts of membership.Holdings that resolve uses."""

    def __init__(self, members: dict[int, tuple[str, ...]], names: dict[int, str]):
        self._members = members
        self._names = names

    def has(self, cik: int) -> bool:
        return cik in self._members

    def tickers_of(self, cik: int) -> tuple[str, ...]:
        return self._members[cik]

    def name_of(self, cik: int) -> str:
        return self._names[cik]


HOLDINGS = Holdings(
    {320193: ("AAPL",), 1652044: ("GOOGL", "GOOG"), 1067983: ("BRK.B",)},
    {320193: "Apple Inc.", 1652044: "Alphabet Inc.", 1067983: "Berkshire Hathaway"},
)
SEC = {
    "AAPL": 320193,
    "GOOGL": 1652044,
    "GOOG": 1652044,
    "BRK.B": 1067983,
    "BRK.A": 1067983,
    "TSLA": 1318605,
}


def test_resolve_by_ticker_picks_the_rated_class():
    found = resolve("goog", SEC, HOLDINGS, aliases={})
    assert found.cik == 1652044
    assert found.rated_ticker == "GOOGL"  # the class with the largest index weight comes first
    assert found.share_classes == ("GOOGL", "GOOG")


def test_resolve_by_alias():
    assert resolve("Google", SEC, HOLDINGS, aliases={"google": 1652044}).cik == 1652044


def test_resolve_by_close_name():
    assert resolve("Berkshire Hathway", SEC, HOLDINGS, aliases={}).cik == 1067983


def test_a_company_outside_the_index_is_not_covered_yet():
    with pytest.raises(NotCovered, match="not covered yet"):
        resolve("TSLA", SEC, HOLDINGS, aliases={})


def test_an_unknown_name_is_not_found():
    with pytest.raises(NotCovered, match="No S&P 500 company"):
        resolve("Zzzzz Widgets", SEC, HOLDINGS, aliases={})
