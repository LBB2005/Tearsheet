"""An invented Dig deeper snapshot for the take's tests, in protocol.DigSnapshot's shape. Every
number, name and headline is made up (the analysts' view comes from the analystdb fixtures)."""

from __future__ import annotations

import asyncio
import copy
from functools import cache
from typing import Any

from tearsheet.protocol import DigSnapshot

AS_OF = "2026-11-17T22:30:00+00:00"


@cache
def _view() -> dict[str, Any]:
    from tests.test_analystdb import REPORT_DAY, Service
    from tests.test_dig_snapshot import ANSWERS

    return asyncio.run(Service(ANSWERS).client().view("AAPL", REPORT_DAY))


def levels(**changes: Any) -> dict[str, Any]:
    return {
        "report_id": "rep-a2",
        "report_date": "2026-11-05",
        "price_date": "2026-11-04",
        "official": True,
        "rating": "Buy",
        "capped": False,
        "report_price": 230.1,
        "bear": 190.0,
        "base": 250.0,
        "bull": 290.0,
        "buy_trigger": 238.0,
        "sell_trigger": 201.0,
        "buy_reachable": True,
        "sell_reachable": True,
        "score_percentile": 72,
        "uncertainty": "medium",
        "source": "run",
    } | changes


def ok(**fields: Any) -> dict[str, Any]:
    return {"state": "ok", "note": None, "as_of": AS_OF} | fields


def sample_snapshot(**changes: Any) -> dict[str, Any]:
    """A whole snapshot; `changes` replace top-level keys (a part, or the header)."""
    snap: dict[str, Any] = {
        "snapshot_id": "dig-320193-20261117T223000Z-abc123",
        "cik": 320193,
        "created_at": AS_OF,
        "close_date": "2026-11-16",
        "report_id": "rep-a2",
        "run_id": "run-a2",
        "versions": {"dig_code": 1, "engine": "0.1.0"},
        "header": {
            "cik": 320193,
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "sector": "Information Technology",
            "close": 250.1,
            "close_date": "2026-11-16",
            "since_report": 0.0869,
            "made_at": "2026-11-05T14:00:00Z",
            "levels": levels(),
        },
        "sector": ok(
            sector="Information Technology",
            members=74,
            left_out=1,
            dates=["2025-11-17", "2026-11-16"],
            stock=[100.0, 112.3],
            sector_line=[100.0, 118.9],
            spy=[100.0, 111.3],
            returns=[
                {"period": "1M", "stock": 0.021, "sector_median": -0.012, "spy": 0.008},
                {"period": "3M", "stock": 0.033, "sector_median": 0.051, "spy": 0.041},
                {"period": "6M", "stock": 0.133, "sector_median": 0.152, "spy": 0.098},
                {"period": "12M", "stock": 0.123, "sector_median": 0.189, "spy": 0.113},
            ],
            rank=41,
            rank_of=75,
        ),
        "market": ok(
            spy_12m=0.1129,
            volatility_percentile=94.3,
            scaling_on=False,
            scaling_note="Momentum scaling is off.",
        ),
        "rates": ok(
            rates=[
                {
                    "id": "DGS10",
                    "label": "10-year Treasury yield",
                    "value": 0.0412,
                    "date": "2026-11-13",
                }
            ]
        ),
        "peers": ok(
            run_id="run-a2",
            report_date="2026-11-05",
            price_date="2026-11-04",
            columns=[
                {"key": "operating_margin", "label": "Operating margin"},
                {"key": "interest_coverage", "label": "Interest coverage"},
            ],
            rows=[
                {
                    "cik": 320193,
                    "ticker": "AAPL",
                    "name": "Apple Inc.",
                    "is_company": True,
                    "numbers": {"operating_margin": 0.31, "interest_coverage": 29.5},
                    "score": 72.5,
                    "rating": "Buy",
                    "rated_at": "2026-11-05",
                    "since_report": 0.0869,
                    "return_12m": 0.123,
                },
                {
                    "cik": 1045810,
                    "ticker": "NVDA",
                    "name": "NVIDIA Corp",
                    "is_company": False,
                    "numbers": {"operating_margin": 0.62, "interest_coverage": None},
                    "score": 90.0,
                    "rating": None,
                    "rated_at": None,
                    "since_report": 0.05,
                    "return_12m": 0.41,
                },
            ],
            median={
                "operating_margin": 0.62,
                "interest_coverage": None,
                "score": 90.0,
                "since_report": 0.05,
                "return_12m": 0.41,
            },
            recomputed_note="Scores recomputed from the report’s stored numbers.",
        ),
        "analysts": ok(
            view=_view() | {"report_id": "rep-a2"},
            ours={
                "bear": 190.0,
                "base": 250.0,
                "bull": 290.0,
                "buy_trigger": 238.0,
                "sell_trigger": 201.0,
            },
        ),
        "insiders": ok(
            days=183,
            buys={"trades": 1, "people": 1, "shares": 1000.0, "value": 230000.0},
            sells={"trades": 2, "people": 2, "shares": 30000.0, "value": 6900000.0},
            rows=[
                {
                    "owner": "Pat Example",
                    "date": "2026-11-02",
                    "code": "P",
                    "shares": 1000.0,
                    "price": 230.0,
                },
                {
                    "owner": "Sam Sample",
                    "date": "2026-10-20",
                    "code": "S",
                    "shares": 20000.0,
                    "price": 231.0,
                },
            ],
            routine_free_buyers=["Pat Example"],
        ),
        "news": ok(
            since="2026-11-05",
            items=[
                {
                    "title": "Apple’s new chip gets an early look",
                    "publisher": "Example Wire",
                    "published": "2026-11-16T13:30:00Z",
                    "url": "https://www.reuters.com/technology/apple-chip-example",
                    "openable": True,
                    "tone": "positive",
                    "tone_why": "Reviewers liked the chip.",
                },
                {
                    "title": "A supplier warns on orders",
                    "publisher": "Not On The List",
                    "published": "2026-11-12T09:00:00Z",
                    "url": "https://news.example.net/supplier",
                    "openable": False,
                    "tone": "negative",
                    "tone_why": "Fewer orders from Apple.",
                },
            ],
            tone={"positive": 1, "neutral": 0, "negative": 1, "unknown": 0},
            source="Massive",
        ),
        "sources": [],
    }
    snap = copy.deepcopy(snap)
    snap.update(copy.deepcopy(changes))
    return DigSnapshot.model_validate(snap).model_dump(mode="json")


def part_off(note: str, **fields: Any) -> dict[str, Any]:
    return {"state": "off", "note": note, "as_of": None} | fields
