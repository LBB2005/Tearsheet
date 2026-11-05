"""The S&P 500 member list (design item 18)."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pytest
import respx

from tearsheet.data import membership
from tearsheet.data.membership import (
    MembershipError,
    load_bundled,
    parse_ivv,
    refresh,
)
from tearsheet.http import HttpClient

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


def run_refresh(database, rawstore, *, today: date, body: str, content_type: str = "text/csv"):
    async def go():
        with respx.mock:
            respx.get(url__regex=r"https://www\.ishares\.com/.*").mock(
                return_value=httpx.Response(200, text=body, headers={"content-type": content_type})
            )
            async with HttpClient(rawstore, "run-1", sleep=lambda s: asyncio.sleep(0)) as http:
                return await refresh(http, rawstore, database.conn, sec_tickers(497), today=today)

    return asyncio.run(go())


def test_refresh_stores_a_snapshot_and_the_membership(database, rawstore):
    result = run_refresh(database, rawstore, today=date(2026, 11, 5), body=ivv_csv(497))
    assert result.holdings.source == "ivv" and result.note is None
    count = database.conn.execute("SELECT COUNT(*) FROM sp500_holdings").fetchone()[0]
    assert count == 500
    members = database.conn.execute("SELECT COUNT(*) FROM sp500_membership").fetchone()[0]
    assert members == 499  # companies, not tickers


def test_refresh_falls_back_to_the_bundled_list_and_says_so(database, rawstore):
    result = run_refresh(
        database,
        rawstore,
        today=date(2026, 11, 5),
        body="<html><body>iShares Core S&P 500 ETF</body></html>",
        content_type="text/csv",
    )
    assert result.holdings.source == "bundled"
    assert "bundled" in result.note


def test_refresh_uses_the_last_good_snapshot_before_the_bundled_list(database, rawstore):
    run_refresh(database, rawstore, today=date(2026, 11, 4), body=ivv_csv(497))
    result = run_refresh(
        database, rawstore, today=date(2026, 11, 5), body="<html><body>no</body></html>"
    )
    assert result.holdings.source == "ivv"
    assert result.holdings.as_of == date(2026, 11, 4)
    assert "last good" in result.note


def test_the_ivv_address_is_the_phase0_one():
    assert "1467271812596.ajax" in membership.IVV_HOLDINGS_URL
