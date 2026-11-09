"""The S&P 500 member list (design item 18)."""

from __future__ import annotations

from datetime import date

import pytest

from tearsheet.data import membership
from tearsheet.data.membership import (
    MembershipError,
    load_bundled,
    parse_ivv,
    shipped,
)

SECTORS = [
    "Information Technology",
    "Health Care",
    "Financials",
    "Industrials",
    "Consumer Discretionary",
]


def sec_tickers(n: int) -> dict[str, int]:
    tickers = {f"T{i:03d}": 1000 + i for i in range(n)}
    tickers["BRK.B"] = 1067983
    tickers["BRK.A"] = 1067983
    tickers["GOOGL"] = 1652044
    tickers["GOOG"] = 1652044
    return tickers


def ivv_csv(n: int, *, extra: list[str] | None = None) -> str:
    lines = [
        "iShares Core S&P 500 ETF",
        'Fund Holdings as of,"Nov 04, 2026"',
        'Inception Date,"May 15, 2000"',
        "\xa0",
        "Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,Market Currency,Accrual Date",
    ]
    for i in range(n):
        sector = SECTORS[i % len(SECTORS)]
        lines.append(
            f'"T{i:03d}","CO {i}","{sector}","Equity","1","0.10","1","1","1","US","NYSE","USD","1","USD","-"'
        )
    lines += [
        '"BRKB","BERKSHIRE HATHAWAY INC CLASS B","Financials","Equity","1","1.60","1","1","1","US","NYSE","USD","1","USD","-"',
        '"GOOGL","ALPHABET INC CLASS A","Communication","Equity","1","2.00","1","1","1","US","NASDAQ","USD","1","USD","-"',
        '"GOOG","ALPHABET INC CLASS C","Communication","Equity","1","1.70","1","1","1","US","NASDAQ","USD","1","USD","-"',
        '"USD","USD CASH","Cash and/or Derivatives","Cash","1","0.05","1","1","1","US","-","USD","1","USD","-"',
        '"ESZ6","S&P500 EMINI DEC 26","Cash and/or Derivatives","Futures","1","0.00","1","1","1","US","-","USD","1","USD","-"',
        *(extra or []),
        " ",
        '"The content contained herein is owned or licensed by BlackRock"',
    ]
    return "\n".join(lines)


def test_ivv_parsing_keeps_equity_rows_and_adds_share_classes():
    holdings = parse_ivv(ivv_csv(497), sec_tickers(497))
    assert holdings.as_of == date(2026, 11, 4)
    assert holdings.source == "ivv"
    assert len(holdings.rows) == 500  # 497 + BRK.B + GOOGL + GOOG; cash and futures dropped
    alphabet = holdings.company(1652044)
    assert alphabet.weight == pytest.approx(3.70)
    assert {r.ticker for r in holdings.rows if r.cik == 1652044} == {"GOOGL", "GOOG"}
    assert holdings.company(1067983).tickers == ("BRK.B",)
    assert holdings.company(1000).sector == "Information Technology"
    # iShares's short sector names are mapped to GICS names.
    assert alphabet.sector == "Communication Services"


def test_the_row_count_check():
    with pytest.raises(MembershipError, match="494 equity rows"):
        parse_ivv(ivv_csv(491), sec_tickers(491))
    with pytest.raises(MembershipError, match="511 equity rows"):
        parse_ivv(ivv_csv(508), sec_tickers(508))


def test_every_row_must_match_a_cik():
    extra = [
        '"ZZZZ","NO SUCH CO","Energy","Equity","1","0.01","1","1","1","US","NYSE","USD","1","USD","-"'
    ]
    with pytest.raises(MembershipError, match="ZZZZ"):
        parse_ivv(ivv_csv(496, extra=extra), sec_tickers(496))


def test_a_web_page_is_not_a_holdings_file():
    with pytest.raises(MembershipError, match="header"):
        parse_ivv("<html><body>iShares</body></html>", sec_tickers(10))


def test_the_bundled_list_loads():
    holdings = load_bundled()
    assert holdings.source == "bundled"
    companies = holdings.companies()
    assert 495 <= len(companies) <= 510
    assert len({c.sector for c in companies}) == 11
    apple = holdings.company(320193)
    assert apple.tickers == ("AAPL",) and apple.sector == "Information Technology"
    assert holdings.company(1652044).tickers == ("GOOG", "GOOGL") or set(
        holdings.company(1652044).tickers
    ) == {"GOOG", "GOOGL"}


def store_ivv_snapshot(database, as_of: str, rows: int = 3) -> None:
    """An IVV file stored by an earlier version (before 8 Nov 2026, when the download stopped)."""
    with database.conn:
        database.conn.executemany(
            "INSERT INTO sp500_holdings (as_of, cik, ticker, sector, weight, raw_hash) VALUES (?, ?, ?, ?, ?, 'h')",
            [(as_of, 1000 + i, f"T{i}", SECTORS[i % len(SECTORS)], 1.0) for i in range(rows)],
        )


def test_the_member_list_is_the_shipped_one_and_nothing_is_downloaded(database):
    # BlackRock's site terms forbid automated copying, so there is no download to make: the
    # function takes no HTTP client at all.
    result = shipped(database.conn)
    assert result.holdings.source == "bundled"
    assert result.holdings.as_of == load_bundled().as_of
    assert "shipped with this version" in result.note


def test_an_older_stored_ivv_file_gives_way_to_the_shipped_list(database):
    store_ivv_snapshot(database, "2026-10-01")
    result = shipped(database.conn)
    assert result.holdings.source == "bundled"


def test_a_newer_stored_ivv_file_is_still_used(database):
    store_ivv_snapshot(database, "2099-01-02")
    result = shipped(database.conn)
    assert result.holdings.source == "ivv"
    assert result.holdings.as_of == date(2099, 1, 2)
    assert "stored on 2 Jan 2099" in result.note


def test_the_ivv_address_is_the_phase0_one():
    assert "1467271812596.ajax" in membership.IVV_HOLDINGS_URL
