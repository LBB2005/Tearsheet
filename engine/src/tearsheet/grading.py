"""Grading predictions (design item 48, Technical Plan §10).

A prediction is graded at 3, 6 and 12 months. The start price is the first daily close after
both the run time and the latest filing's acceptance time; the end price is the last close on
or before the start date plus that many calendar months, and a horizon is due once the market
has a close on or after that date. Excess return is the company's total return minus the
equal-weighted total return of the peer list fixed at prediction time (dividends reinvested). A
company or peer that is bought out or delisted is held at its last price as cash.

Grades depend only on the stored prediction and stored prices, and carry the grading-rules
version, so a rule change grades everything again as new rows; old rows are never overwritten.
Statistics use one official prediction per company per rolling 12 months, are grouped by method
code version and methodology hash, and are labelled "descriptive, not conclusive" until enough
12-month grades exist.
"""

from __future__ import annotations

import calendar
import hashlib
import json
import math
import random
import sqlite3
import statistics
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from tearsheet.data.prices import SPY_CIK, PriceStore
from tearsheet.http import EASTERN

CLOSE = time(16, 0)
Z_10_90 = 1.2816


def load_rules() -> dict[str, Any]:
    from tearsheet.methodology import load

    return load().grading


# --- dates and prices -----------------------------------------------------------------------


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def close_time(day: date) -> datetime:
    return datetime.combine(day, CLOSE, tzinfo=EASTERN)


def start_point(store: PriceStore, cik: int, *, after: datetime) -> tuple[date, float] | None:
    """The first stored close whose closing time is after `after`."""
    for day, close in store.closes(cik):
        if close_time(day) > after:
            return day, close
    return None


def end_point(store: PriceStore, cik: int, target: date) -> tuple[date, float] | None:
    return store.latest_close(cik, up_to=target)


def is_due(store: PriceStore, target: date) -> bool:
    """Due once the market (SPY) has a close on or after the target date."""
    latest = store.latest_close(SPY_CIK)
    return latest is not None and latest[0] >= target


# --- rules ------------------------------------------------------------------------------------


def hold_band(uncertainty: str, months: int, rules: dict[str, Any]) -> float:
    """The Hold band as a fraction, scaled by √(months ÷ 12) below 12 months."""
    points = float(rules["hold_band_points"][uncertainty])
    return points / 100 * math.sqrt(min(months, 12) / 12)


def is_hit(rating: str, excess: float, band: float) -> bool:
    if rating == "Buy":
        return excess > 0
    if rating == "Sell":
        return excess < 0
    return abs(excess) <= band


def horizon_range(
    *, start_price: float, bear: float, base: float, bull: float, months: int
) -> tuple[float, float, float]:
    """The range at a horizon: the base case in a straight line from the start price, and the
    lognormal spread scaled by √(months ÷ 12)."""
    share = months / 12
    base_m = start_price + (base - start_price) * share
    vol = math.log(bull / base) / Z_10_90 if base > 0 and bull > 0 else 0.0
    spread = Z_10_90 * vol * math.sqrt(share)
    return base_m * math.exp(-spread), base_m, base_m * math.exp(spread)


def interval_score(low: float, high: float, outcome: float, alpha: float) -> float:
    """The interval score for a central (1 − alpha) interval: width plus penalties for misses."""
    score = high - low
    if outcome < low:
        score += 2 / alpha * (low - outcome)
    if outcome > high:
        score += 2 / alpha * (outcome - high)
    return score


# --- one grade --------------------------------------------------------------------------------


def _return(store: PriceStore, cik: int, start: date, end: date) -> float | None:
    return store.total_return(cik, "", start, end)


def grade_one(
    store: PriceStore, p: sqlite3.Row | dict, peers: list[int], months: int, rules: dict[str, Any]
) -> dict[str, Any] | None:
    run_at = datetime.fromisoformat(p["run_at"])
    accepted = datetime.fromisoformat(p["latest_acceptance_at"])
    start = start_point(store, p["cik"], after=max(run_at, accepted))
    if start is None:
        return None
    start_date, start_price = start
    target = add_months(start_date, months)
    if not is_due(store, target):
        return None
    end = end_point(store, p["cik"], target)
    company = _return(store, p["cik"], start_date, target)
    if end is None or company is None:
        return None
    peer_returns = {c: _return(store, c, start_date, target) for c in peers}
    used = [r for r in peer_returns.values() if r is not None]
    peer = statistics.fmean(used) if used else None
    spy = _return(store, SPY_CIK, start_date, target)
    excess = None if peer is None else company - peer
    band = hold_band(p["uncertainty"], months, rules)
    result: dict[str, Any] = {
        "start_date": start_date.isoformat(),
        "start_price": start_price,
        "end_target": target.isoformat(),
        "end_date": end[0].isoformat(),
        "end_price": end[1],
        "company_return": company,
        "peer_return": peer,
        "spy_return": spy,
        "excess": excess,
        "band": band,
        "hit": None if excess is None else is_hit(p["rating"], excess, band),
        "peers_used": len(used),
        "peers_missing": [c for c, r in peer_returns.items() if r is None],
        "range": None,
        "brier": None,
    }
    if p["bear"] is not None and p["base"] is not None and p["bull"] is not None:
        bear, base, bull = horizon_range(
            start_price=start_price, bear=p["bear"], base=p["base"], bull=p["bull"], months=months
        )
        # The end price on the start date's share basis.
        outcome = end[1] * store.split_factor(p["cik"], after=start_date, up_to=end[0])
        alpha = float(rules["range"]["alpha"])
        result["range"] = {
            "bear": bear,
            "base": base,
            "bull": bull,
            "outcome": outcome,
            "inside": bear <= outcome <= bull,
            "below": outcome < bear,
            "above": outcome > bull,
            "interval_score": interval_score(bear, bull, outcome, alpha),
        }
    if p["probability"] is not None and excess is not None:
        beat = 1.0 if excess > 0 else 0.0
        result["brier"] = {
            "probability": p["probability"],
            "outcome": beat,
            "score": (p["probability"] - beat) ** 2,
        }
    return result


def grade_due(
    conn: sqlite3.Connection, store: PriceStore, rules: dict[str, Any], *, now: datetime
) -> int:
    """Grade every due horizon not yet graded under these rules. Returns the rows added."""
    version = int(rules["version"])
    added = 0
    for p in conn.execute("SELECT * FROM predictions ORDER BY run_at").fetchall():
        peers = [
            r[0]
            for r in conn.execute(
                "SELECT peer_cik FROM peer_groups WHERE run_id = ? ORDER BY peer_cik",
                (p["run_id"],),
            )
        ]
        for months in rules["horizons_months"]:
            done = conn.execute(
                "SELECT 1 FROM grades WHERE prediction_id = ? AND horizon_months = ? AND grading_version = ?",
                (p["prediction_id"], months, version),
            ).fetchone()
            if done:
                continue
            result = grade_one(store, p, peers, int(months), rules)
            if result is None:
                continue
            with conn:
                conn.execute(
                    "INSERT INTO grades (prediction_id, horizon_months, graded_at, grading_version, start_price, results_json) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        p["prediction_id"],
                        int(months),
                        now.isoformat(),
                        version,
                        result["start_price"],
                        json.dumps(result),
                    ),
                )
            added += 1
    return added


# --- statistics -------------------------------------------------------------------------------


def headline(predictions: list[dict], *, min_gap_days: int) -> list[dict]:
    """One official prediction per company per rolling 12 months: the first, then the next one
    made at least `min_gap_days` later, and so on."""
    kept: list[dict] = []
    last: dict[int, datetime] = {}
    for p in sorted(predictions, key=lambda r: (r["run_at"], r["prediction_id"])):
        when = datetime.fromisoformat(p["run_at"])
        previous = last.get(p["cik"])
        if previous is None or when - previous >= timedelta(days=min_gap_days):
            kept.append(p)
            last[p["cik"]] = when
    return kept


def wilson(k: int, n: int, z: float = 1.96) -> dict[str, float | None]:
    if n == 0:
        return {"value": None, "low": None, "high": None}
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return {"value": p, "low": max(0.0, centre - half), "high": min(1.0, centre + half)}


def bootstrap_mean(
    values: list[float], *, seed: int, runs: int, confidence: float
) -> dict[str, float | None]:
    if not values:
        return {"value": None, "low": None, "high": None}
    rnd = random.Random(seed)
    means = sorted(statistics.fmean(rnd.choices(values, k=len(values))) for _ in range(runs))
    cut = (1 - confidence) / 2
    return {
        "value": statistics.fmean(values),
        "low": means[int(cut * runs)],
        "high": means[min(runs - 1, int((1 - cut) * runs))],
    }


def _seed(version: int, ids: list[str]) -> int:
    digest = hashlib.sha256(f"{version}|{'|'.join(sorted(ids))}".encode()).hexdigest()
    return int(digest[:16], 16)


def _naive_coverage(store: PriceStore, rows: list[tuple[dict, dict]], months: int) -> float | None:
    """A range centered on the start price, from the stock's own past-year volatility, with no
    value-gap shift."""
    inside = []
    for p, g in rows:
        start = date.fromisoformat(g["start_date"])
        returns = store.log_returns(p["cik"], up_to=start)[-252:]
        if len(returns) < 60:
            continue
        vol = statistics.pstdev(returns) * math.sqrt(252) * math.sqrt(months / 12)
        low, high = (
            g["start_price"] * math.exp(-Z_10_90 * vol),
            g["start_price"] * math.exp(Z_10_90 * vol),
        )
        outcome = g["range"]["outcome"] if g.get("range") else g["end_price"]
        inside.append(low <= outcome <= high)
    return sum(inside) / len(inside) if inside else None


def _horizon_stats(
    store: PriceStore | None,
    rows: list[tuple[dict, dict]],
    months: int,
    rules: dict[str, Any],
    version: int,
) -> dict[str, Any]:
    ids = [p["prediction_id"] for p, _ in rows]
    seed = _seed(version, ids)
    runs, boot, conf = (
        int(rules["random_baseline_runs"]),
        int(rules["bootstrap_runs"]),
        float(rules["confidence"]),
    )
    scored = [(p, g) for p, g in rows if g.get("hit") is not None]
    hits = sum(1 for _, g in scored if g["hit"])
    by_rating: dict[str, Any] = {}
    for rating in ("Buy", "Hold", "Sell"):
        group = [(p, g) for p, g in scored if p["rating"] == rating]
        by_rating[rating] = {
            "count": len(group),
            "hit_rate": wilson(sum(1 for _, g in group if g["hit"]), len(group)),
            "mean_excess": bootstrap_mean(
                [g["excess"] for _, g in group], seed=seed + len(rating), runs=boot, confidence=conf
            ),
        }
    # Random ratings in the same mix, simulated with a fixed seed.
    rnd = random.Random(seed)
    ratings = [p["rating"] for p, _ in scored]
    sims = []
    for _ in range(runs if scored else 0):
        shuffled = ratings[:]
        rnd.shuffle(shuffled)
        sims.append(
            sum(
                is_hit(r, g["excess"], g["band"])
                for r, (_, g) in zip(shuffled, scored, strict=True)
            )
            / len(scored)
        )
    briers = [g["brier"] for _, g in rows if g.get("brier")]
    base_rate = statistics.fmean(b["outcome"] for b in briers) if briers else None
    ranges = [g["range"] for _, g in rows if g.get("range")]
    return {
        "count": len(rows),
        "hit_rate": wilson(hits, len(scored)),
        "by_rating": by_rating,
        "mean_excess": bootstrap_mean(
            [g["excess"] for _, g in scored], seed=seed, runs=boot, confidence=conf
        ),
        "brier": None
        if not briers
        else {
            "value": statistics.fmean(b["score"] for b in briers),
            "base_rate": base_rate,
            "base_rate_brier": statistics.fmean((base_rate - b["outcome"]) ** 2 for b in briers),
            "interval": bootstrap_mean(
                [b["score"] for b in briers], seed=seed + 7, runs=boot, confidence=conf
            ),
        },
        "range": None
        if not ranges
        else {
            "coverage": wilson(sum(r["inside"] for r in ranges), len(ranges)),
            "below_bear": sum(r["below"] for r in ranges) / len(ranges),
            "above_bull": sum(r["above"] for r in ranges) / len(ranges),
            "mean_interval_score": statistics.fmean(r["interval_score"] for r in ranges),
            "targets": {
                "coverage": rules["range"]["coverage_target"],
                "each_tail": rules["range"]["tail_target"],
            },
        },
        "baselines": {
            "random_mix_hit_rate": statistics.fmean(sims) if sims else None,
            "always_hold_hit_rate": (
                sum(1 for _, g in scored if abs(g["excess"]) <= g["band"]) / len(scored)
            )
            if scored
            else None,
            "naive_range_coverage": _naive_coverage(
                store, [(p, g) for p, g in rows if g.get("range")], months
            )
            if store
            else None,
        },
    }


def summary(
    conn: sqlite3.Connection, rules: dict[str, Any], *, store: PriceStore | None = None
) -> dict[str, Any]:
    """The log's statistics under the current grading rules."""
    version = int(rules["version"])
    predictions = [dict(r) for r in conn.execute("SELECT * FROM predictions")]
    chosen = {
        p["prediction_id"]: p
        for p in headline(predictions, min_gap_days=int(rules["headline_min_gap_days"]))
    }
    graded: dict[tuple, dict[int, list]] = defaultdict(lambda: defaultdict(list))
    for r in conn.execute(
        "SELECT prediction_id, horizon_months, results_json FROM grades WHERE grading_version = ?",
        (version,),
    ):
        p = chosen.get(r["prediction_id"])
        if p is None:
            continue
        graded[(p["method_code_version"], p["methodology_hash"])][r["horizon_months"]].append(
            (p, json.loads(r["results_json"]))
        )
    groups = []
    for (code, method_hash), horizons in sorted(graded.items()):
        groups.append(
            {
                "method_code_version": code,
                "methodology_hash": method_hash,
                "grading_version": version,
                "horizons": {
                    str(m): _horizon_stats(store, rows, m, rules, version)
                    for m, rows in sorted(horizons.items())
                },
            }
        )
    twelve = sum(len(h.get(12, [])) for h in graded.values())
    return {
        "label": "conclusive"
        if twelve >= int(rules["conclusive_after"])
        else "descriptive, not conclusive",
        "headline_graded_12m": twelve,
        "groups": groups,
        "note": "This log grades the companies you chose to look up, not the method as a whole.",
    }


# --- the grading job (item 48) ----------------------------------------------------------------


def _tickers(conn: sqlite3.Connection) -> dict[int, str]:
    """CIK → ticker for the companies and peers in the log: the predictions' own tickers, then
    the latest holdings snapshot, then the bundled list."""
    from tearsheet.data.membership import load_bundled

    known = {c.cik: c.tickers[0] for c in load_bundled().companies()}
    for r in conn.execute(
        "SELECT cik, ticker FROM sp500_holdings WHERE as_of = (SELECT MAX(as_of) FROM sp500_holdings)"
    ):
        known[r[0]] = r[1]
    for r in conn.execute(
        "SELECT cik, ticker FROM tickers WHERE share_class = '' ORDER BY date_from"
    ):
        known[r[0]] = r[1]  # what each run recorded, so a peer that left the index keeps its ticker
    for r in conn.execute("SELECT cik, ticker FROM predictions"):
        known[r[0]] = r[1]
    return known


async def grade_job(
    conn: sqlite3.Connection, data, rules: dict[str, Any], *, now: datetime, backup_dir
) -> dict[str, Any]:
    """Fetch later prices for every prediction's company and fixed peer list (through the shared
    Massive limiter), grade what is due, and back up the database."""
    from tearsheet.db import backup

    store = PriceStore(conn)
    if conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 0:
        return {"graded": 0, "note": "No predictions are logged yet."}
    ciks = {r[0] for r in conn.execute("SELECT cik FROM predictions")}
    ciks |= {
        r[0]
        for r in conn.execute(
            "SELECT peer_cik FROM peer_groups WHERE run_id IN (SELECT run_id FROM predictions)"
        )
    }
    tickers = _tickers(conn)
    members = {cik: tickers[cik] for cik in sorted(ciks) if cik in tickers}
    await data.fill_prices(store, members, end=now.astimezone(UTC).date())
    graded = grade_due(conn, store, rules, now=now)
    if graded:
        backup(conn, backup_dir)
    return {"graded": graded}
