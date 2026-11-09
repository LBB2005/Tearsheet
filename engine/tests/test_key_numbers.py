"""The Key numbers under the price chart (key_numbers.py): four groups made from numbers
Tearsheet already stores, each row with its working, a short reason where a number can't be
filled, and summaries written by fixed rules."""

from __future__ import annotations

import json
from datetime import date, timedelta

from tearsheet.key_numbers import _versus, key_numbers, money, move, times
from tearsheet.protocol import KeyNumbers
from tearsheet.report_numbers import bar_numbers, numbers_for

PRICED = date(2026, 11, 4)

REPORT = {
    "sections": [
        {
            "key": "rating",
            "paragraphs": [
                "Rating: Hold. The rating is relative to the company's peer group.",
                "Total return over the past 12 months: T -9.1%; peer group (equal-weighted)"
                " 55.7%; S&P 500 (SPY) 13.4%.",
            ],
        },
        {"key": "valuation", "paragraphs": ["Price: $200.00 on 4 Nov 2026."]},
    ]
}


def _inputs(price, eps, mv, ev, revenue, ebit, ebitda, net_debt, interest, ocf, capex, ni):
    """Each metric's stored inputs, as the pipeline keeps them (metrics.compute_metrics)."""
    return {
        "earnings_yield": {"diluted_eps": eps, "price": price},
        "ebit_to_ev": {"ebit": ebit, "enterprise_value": ev},
        "sales_to_ev": {"revenue": revenue, "enterprise_value": ev},
        "free_cash_flow_yield": {
            "operating_cash_flow": ocf,
            "capital_spending": capex,
            "market_value": mv,
        },
        "operating_margin": {"ebit": ebit, "revenue": revenue},
        "return_on_equity": {"net_income_common": ni, "average_common_equity": ni * 5},
        "net_debt_to_ebitda": {"net_debt": net_debt, "ebitda": ebitda},
        "interest_coverage": {"ebit": ebit, "interest_expense": interest},
        "operating_cash_flow_to_net_income": {"operating_cash_flow": ocf, "net_income": ni},
        "return_on_invested_capital": {
            "ebit": ebit,
            "tax_rate": 0.2,
            "average_invested_capital": 100e9,
        },
    }


def _values(i: dict) -> dict[str, float | None]:
    """The metric values the pipeline would store from those inputs (None for infinite)."""
    e, s = i["earnings_yield"], i["sales_to_ev"]
    f, nd = i["free_cash_flow_yield"], i["net_debt_to_ebitda"]
    ic, cf = i["interest_coverage"], i["operating_cash_flow_to_net_income"]
    return {
        "earnings_yield": e["diluted_eps"] / e["price"],
        "ebit_to_ev": i["ebit_to_ev"]["ebit"] / s["enterprise_value"],
        "sales_to_ev": s["revenue"] / s["enterprise_value"],
        "free_cash_flow_yield": (f["operating_cash_flow"] - (f["capital_spending"] or 0))
        / f["market_value"],
        "operating_margin": i["operating_margin"]["ebit"] / s["revenue"],
        "return_on_equity": 0.2,
        "net_debt_to_ebitda": nd["net_debt"] / nd["ebitda"] if nd["ebitda"] > 0 else None,
        "interest_coverage": ic["ebit"] / ic["interest_expense"]
        if ic["interest_expense"]
        else None,
        "operating_cash_flow_to_net_income": cf["operating_cash_flow"] / cf["net_income"]
        if cf["net_income"] > 0
        else None,
        "return_on_invested_capital": 0.1,
    }


def seed(conn, *, financial_class: str = "", company: dict | None = None, prices: bool = True):
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
        " method_code_version, methodology_hash, reference_version)"
        " VALUES ('r1', 1, 'full', ?, 'done', 'x', 1, 'h', 'v')",
        (f"{PRICED.isoformat()}T20:00:00-05:00",),
    )
    conn.execute(
        "INSERT INTO companies (cik, name, financial_class) VALUES (1, 'T Corp', ?)",
        (financial_class,),
    )
    mine = company or _inputs(
        200.0, 10.0, 200e9, 230e9, 50e9, 10e9, 14e9, 30e9, 0.5e9, 16e9, 1e9, 8e9
    )
    peers = {
        2: _inputs(100.0, 2.5, 100e9, 110e9, 10e9, 3e9, 4e9, 2e9, 0.1e9, 3e9, 0.5e9, 2e9),
        3: _inputs(100.0, 4.0, 100e9, 120e9, 20e9, 6e9, 8e9, 1e9, 0.4e9, 7e9, 1e9, 5e9),
        4: _inputs(100.0, 5.0, 100e9, 100e9, 12e9, 3e9, 5e9, 4e9, 0.2e9, 4e9, 0.5e9, 3e9),
    }
    for cik, inputs in {1: mine, **peers}.items():
        values = _values(inputs)
        if cik == 1 and financial_class in ("bank", "insurer"):
            for name in (
                "ebit_to_ev",
                "sales_to_ev",
                "free_cash_flow_yield",
                "operating_margin",
                "net_debt_to_ebitda",
                "interest_coverage",
                "operating_cash_flow_to_net_income",
                "return_on_invested_capital",
            ):
                values[name] = None
        for name, inp in inputs.items():
            conn.execute(
                "INSERT INTO metrics VALUES ('r1', ?, ?, ?, ?)",
                (cik, name, values[name], json.dumps(inp)),
            )
        if cik != 1:
            conn.execute("INSERT INTO peer_groups VALUES ('r1', 1, ?, 0.33)", (cik,))
    if prices:
        # A year and a bit of closes rising to 299.80 on 4 Nov, then 210 and the last close, 200,
        # on 6 Nov; the low is 190 in the spring.
        last = date(2026, 11, 6)
        for d in range(2, 420):
            day = last - timedelta(days=d)
            close = 190.0 if day == date(2026, 4, 1) else 300.0 - d * 0.1
            conn.execute(
                "INSERT INTO prices_daily VALUES (1, '', ?, ?, ?, 'massive', 'h')",
                (day.isoformat(), close, 2_000_000),
            )
        conn.execute(
            "INSERT INTO prices_daily VALUES (1, '', '2026-11-05', 210.0, 1000000, 'massive', 'h')"
        )
        conn.execute(
            "INSERT INTO prices_daily VALUES (1, '', ?, 200.0, 1000000, 'massive', 'h')",
            (last.isoformat(),),
        )
    conn.commit()


def table(conn) -> dict:
    numbers = numbers_for(conn, REPORT, "r1", 1)
    keys = key_numbers(conn, numbers, bar_numbers(conn, numbers, "r1", 1), "r1", 1)
    assert keys is not None
    KeyNumbers.model_validate(keys)
    return keys


def rows(keys: dict) -> dict[str, dict]:
    return {r["key"]: r for g in keys["groups"] for r in g["rows"]}


def test_four_groups_in_the_designs_order(database):
    seed(database.conn)
    keys = table(database.conn)
    assert [(g["key"], g["name"]) for g in keys["groups"]] == [
        ("trading", "Price and trading"),
        ("value", "Size and value"),
        ("profit", "Profit and cash"),
        ("debt", "Debt and safety"),
    ]
    assert [[r["label"] for r in g["rows"]] for g in keys["groups"]] == [
        ["Price", "Day's move", "52-week range", "12-month return", "Avg daily volume"],
        ["Market value", "Enterprise value", "P/E", "EV / EBITDA", "EV / sales"],
        [
            "Revenue",
            "Operating margin",
            "Free cash flow",
            "Free cash flow yield",
            "Return on equity",
        ],
        [
            "Net debt",
            "Net debt / EBITDA",
            "Interest cover",
            "Cash flow / profit",
            "Return on capital",
        ],
    ]
    assert keys["close_date"] == "2026-11-06"
    assert keys["report_date"] == "2026-11-04"
    assert keys["peers"] == 3
    assert "median of the 3 peers in the report" in keys["source"]


def test_price_rows_reuse_the_top_bar_and_the_stored_prices(database):
    seed(database.conn)
    r = rows(table(database.conn))
    assert r["price"]["text"] == "$200.00"
    assert r["day_move"]["text"] == "−4.8%" and r["day_move"]["tone"] == "down"
    assert "From $210.00 at the close before to $200.00" in r["day_move"]["working"]
    assert r["range_52w"]["text"] == "$190 – $300"
    assert "$190.00 on 1 Apr 2026, the highest $299.80 on 4 Nov 2026" in r["range_52w"]["working"]
    # The report's own 12-month figures, the company's coloured, the peer group's beside it.
    assert r["return_12m"]["text"] == "−9.1%" and r["return_12m"]["peer_text"] == "+55.7%"
    assert r["return_12m"]["tone"] == "down"
    # 63 sessions: the two newest have 1M shares, the rest 2M.
    assert r["volume"]["text"] == "2.0M" and "last 63 sessions" in r["volume"]["working"]


def test_value_rows_and_peer_medians_from_the_stored_inputs(database):
    seed(database.conn)
    r = rows(table(database.conn))
    assert r["market_value"]["text"] == "$200.0B"
    assert "× 1.0B shares" in r["market_value"]["working"]
    assert r["enterprise_value"]["text"] == "$230.0B"
    # P/E 200 / 10; peers 40, 25 and 20.
    assert r["pe"]["text"] == "20.0×" and r["pe"]["peer_text"] == "25.0×"
    assert "$200.00, ÷ diluted earnings per share" in r["pe"]["working"]
    # EV/EBITDA 230 / 14; peers 27.5, 15, 20.
    assert r["ev_ebitda"]["text"] == "16.4×" and r["ev_ebitda"]["peer_text"] == "20.0×"
    # EV/sales 230 / 50; peers 11, 6, 8.3.
    assert r["ev_sales"]["text"] == "4.6×" and r["ev_sales"]["peer_text"] == "8.3×"


def test_profit_and_debt_rows_show_their_working(database):
    seed(database.conn)
    r = rows(table(database.conn))
    assert r["revenue"]["text"] == "$50.0B"
    assert r["operating_margin"]["text"] == "20.0%"
    assert r["operating_margin"]["peer_text"] == "30.0%"  # peers 30%, 30%, 25%
    assert r["free_cash_flow"]["text"] == "$15.0B"
    assert "$16.0 billion, less capital spending, $1.0 billion" in r["free_cash_flow"]["working"]
    assert r["fcf_yield"]["text"] == "7.5%"
    assert r["net_debt"]["text"] == "$30.0B"
    assert r["net_debt_ebitda"]["text"] == "2.1×"
    assert r["interest_cover"]["text"] == "20.0×"
    assert r["cash_to_profit"]["text"] == "2.0×"
    assert r["return_on_capital"]["text"] == "10.0%"
    for row in r.values():
        assert row["working"] and row["note"] is None


def test_summaries_follow_fixed_rules(database):
    seed(database.conn)
    keys = table(database.conn)
    summary = {g["key"]: g["summary"] for g in keys["groups"]}
    assert summary == {
        "trading": "$200.00 · down 9.1% in a year",
        "value": "$200.0B · cheaper than peers on 3 of 3",
        "profit": "$50.0B revenue · below peers on 1 of 3, above on 1",
        "debt": "Net debt $30.0B · more debt than peers",
    }


def test_banks_leave_out_what_the_report_leaves_out(database):
    seed(database.conn, financial_class="bank")
    keys = table(database.conn)
    r = rows(keys)
    for key in (
        "enterprise_value",
        "ev_ebitda",
        "ev_sales",
        "operating_margin",
        "free_cash_flow",
        "fcf_yield",
        "net_debt",
        "net_debt_ebitda",
        "interest_cover",
        "cash_to_profit",
        "return_on_capital",
    ):
        assert r[key]["text"] is None and r[key]["note"] == "not for banks", key
        assert r[key]["peer_text"] is None
    assert r["pe"]["text"] == "20.0×" and r["return_on_equity"]["text"] == "20.0%"
    summary = {g["key"]: g["summary"] for g in keys["groups"]}
    assert summary["value"] == "$200.0B · cheaper than peers on 1 of 1"
    assert summary["debt"] == "Left out for banks, as in the report"


def test_a_loss_and_no_interest_give_a_reason_not_a_number(database):
    company = _inputs(200.0, -1.0, 200e9, 230e9, 50e9, -2e9, -1e9, 30e9, None, 4e9, None, -3e9)
    seed(database.conn, company=company)
    r = rows(table(database.conn))
    assert r["pe"]["text"] is None and r["pe"]["note"] == "no profit"
    assert r["ev_ebitda"]["text"] is None and r["ev_ebitda"]["note"] == "EBITDA below zero"
    assert r["net_debt_ebitda"]["note"] == "EBITDA below zero"
    assert r["interest_cover"]["note"] == "no interest found"
    assert r["cash_to_profit"]["note"] == "no profit"
    # No capital spending found: the working says so rather than "$0".
    assert "none found in the filings" in r["free_cash_flow"]["working"]


def test_without_prices_or_metrics_every_row_says_why(database):
    seed(database.conn, prices=False)
    database.conn.execute("DELETE FROM metrics")
    database.conn.commit()
    keys = table(database.conn)
    for row in rows(keys).values():
        if row["key"] == "return_12m":  # the report's own line still gives it
            assert row["text"] == "−9.1%"
            continue
        assert row["text"] is None and row["peer_text"] is None, row["key"]
        assert row["note"] and row["working"]
    summary = {g["key"]: g["summary"] for g in keys["groups"]}
    assert summary["trading"] == "Down 9.1% in a year"
    assert summary["value"] == "Not stored for this report"


def test_odd_stored_inputs_never_raise(database):
    seed(database.conn)
    database.conn.execute("UPDATE metrics SET inputs_json = 'not json' WHERE cik = 1")
    database.conn.commit()
    r = rows(table(database.conn))
    assert r["market_value"]["note"] == "not stored"
    assert r["operating_margin"]["text"] == "20.0%"  # the stored value still shows


def test_writing_the_numbers():
    assert money(175.83e9) == "$175.8B"
    assert money(3.9404e12) == "$3.94T"
    assert money(-1.55e9) == "−$1.6B"
    assert money(95.4e6) == "$95.4M"
    assert times(-0.0077) == "0.0×" and times(-1.25) == "−1.2×"
    assert move(-9.1) == "−9.1%" and move(55.7) == "+55.7%" and move(0.01) == "0.0%"


def test_versus_says_which_way_most_lean():
    def says(pairs):
        return _versus(pairs, "cheaper", "pricier", " than peers")

    assert says([(1, 2), (3, 4), (5, 6)]) == "cheaper than peers on 3 of 3"
    assert says([(3, 2), (3, 4), (7, 6)]) == "pricier than peers on 2 of 3"
    assert says([(1, 2), (3, 2), (2, 2)]) == "cheaper than peers on 1 of 3, pricier on 1"
    assert says([(1, None), (None, 2)]) == ""
    assert says([(2, 2)]) == "in line with peers"
