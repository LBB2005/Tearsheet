"""Dig deeper's insiders part (dig/insiders.py): open-market buys and sells over 6 months."""

from __future__ import annotations

from datetime import date, timedelta

from tearsheet.data.sec import Form4Trade
from tearsheet.dig.insiders import INSIDER_DAYS, insiders_part

TODAY = date(2026, 11, 9)


def trade(owner, days_ago, code, shares=None, price=None):
    return Form4Trade(owner, TODAY - timedelta(days=days_ago), code, shares, price, None)


def test_buys_and_sells_in_the_window_are_counted():
    trades = [
        trade("Ann", 10, "P", 1000.0, 10.0),
        trade("Ann", 40, "P", 500.0, None),
        trade("Bob", 20, "S", 300.0, 20.0),
        trade("Cy", 30, "S", 200.0, 25.0),
        trade("Cy", 200, "S", 9999.0, 1.0),  # before the 6 months
        trade("Dee", 5, "M", 100.0, 1.0),  # an option exercise: not an open-market trade
    ]
    part = insiders_part(trades, today=TODAY)
    assert part["state"] == "ok" and part["days"] == INSIDER_DAYS == 183
    assert part["buys"] == {"trades": 2, "people": 1, "shares": 1500.0, "value": 10000.0}
    assert part["sells"] == {"trades": 2, "people": 2, "shares": 500.0, "value": 11000.0}
    assert [(r["owner"], r["code"]) for r in part["rows"]] == [
        ("Ann", "P"),
        ("Bob", "S"),
        ("Cy", "S"),
        ("Ann", "P"),
    ]
    assert part["rows"][0] == {
        "owner": "Ann",
        "date": "2026-10-30",
        "code": "P",
        "shares": 1000.0,
        "price": 10.0,
    }


def test_non_routine_buyers_are_named():
    routine = [trade("Ann", 10 + 365 * k, "P", 1.0, 1.0) for k in range(4)]
    part = insiders_part([*routine, trade("Bob", 3, "P", 1.0, 1.0)], today=TODAY)
    assert part["routine_free_buyers"] == ["Bob"]


def test_only_the_newest_20_trades_are_listed():
    part = insiders_part([trade("Ann", d, "S", 1.0, 1.0) for d in range(30)], today=TODAY)
    assert len(part["rows"]) == 20 and part["sells"]["trades"] == 30
    assert part["rows"][0]["date"] == TODAY.isoformat()


def test_insiders_are_down_when_sec_failed():
    part = insiders_part(None, today=TODAY)
    assert part["state"] == "down" and part["note"] == "SEC didn't answer."


def test_no_trades_is_ok_and_empty():
    part = insiders_part([], today=TODAY)
    assert part["state"] == "ok" and part["rows"] == [] and part["buys"]["trades"] == 0


def test_live_data_reads_amounts_from_the_same_filings_as_the_trades(database, rawstore):
    """form4_amounts reads the filings form4_trades reads, older purchase months included."""
    import asyncio

    from tearsheet.data.sec import Filing
    from tearsheet.sources import LiveData
    from tests.test_sec import amounts_xml

    def filing(day, n):
        return Filing(
            1, f"0000000000-26-{n:06d}", "4", date.fromisoformat(day), None, "", (), "f.xml"
        )

    files = {
        "0000000000-26-000001": amounts_xml(("2026-10-01", "P", "10", "5", "A")),
        "0000000000-26-000002": amounts_xml(("2025-10-02", "P", "1", "1", "A"), owner="Old"),
        "0000000000-26-000003": amounts_xml(("2025-06-02", "S", "1", "1", "D"), owner="Skipped"),
    }

    class Sec:
        async def filings(self, cik, *, since):
            return [filing("2026-10-02", 1), filing("2025-10-03", 2), filing("2025-06-03", 3)]

        async def form4_documents(self, filings):
            return [(f, files[f.accession]) for f in filings]

    live = LiveData(None, rawstore, database.conn, fred_key=None)
    live.sec = Sec()
    amounts = asyncio.run(live.form4_amounts(1, today=TODAY))
    trades = asyncio.run(live.form4_trades(1, today=TODAY))
    assert [(t.owner, t.day, t.code) for t in amounts] == trades
    assert [t.owner for t in amounts] == ["Jane Doe", "Old"]
    assert amounts[0].shares == 10.0 and amounts[0].price == 5.0
