"""Dig deeper's take: the placeholders the AI may write and the Buy price line code writes.

Every figure in a take comes from here. Values come only from parts that are fresh or carried
from an earlier snapshot ("ok" or "stale"); an empty value has no placeholder, so a sentence
that needs it is removed rather than filled with "not available". The Buy price is the
report's trigger, reachable by price as the Watchlist decides (watchlist.Levels.trigger)."""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from tearsheet.render import PlaceholderValue, format_value
from tearsheet.watchlist import Levels

USABLE = ("ok", "stale")
# The report's key numbers that read as multiples; the rest are ratios shown as percents.
MULTIPLES = frozenset({"interest_coverage", "operating_cash_flow_to_net_income"})


def levels_of(lv: dict[str, Any]) -> Levels:
    """A snapshot's levels (protocol.WatchLevels) as the Watchlist's Levels."""
    return Levels(
        ref=lv["report_id"] or "prediction",
        report_id=lv["report_id"],
        report_date=lv["report_date"],
        price_date=date.fromisoformat(lv["price_date"]),
        official=lv["official"],
        rating=lv["rating"],
        capped=lv["capped"],
        report_price=lv["report_price"],
        bear=lv["bear"],
        base=lv["base"],
        bull=lv["bull"],
        buy=lv["buy_trigger"],
        sell=lv["sell_trigger"],
        buy_reachable=lv["buy_reachable"],
        sell_reachable=lv["sell_reachable"],
        score_percentile=lv["score_percentile"],
        uncertainty=lv["uncertainty"],
        source=lv["source"],
    )


def _usable(part: dict[str, Any]) -> bool:
    return part.get("state") in USABLE


def placeholders(snapshot: dict[str, Any]) -> dict[str, PlaceholderValue]:
    out: dict[str, PlaceholderValue] = {}

    def put(key: str, kind: str, value: Any) -> None:
        if value is None or (isinstance(value, float) and not math.isfinite(value)):
            return
        out.setdefault(key, PlaceholderValue(key, kind, value))

    head = snapshot["header"]
    put("level:close", "price", head["close"])
    put("level:close_date", "date", head["close_date"])
    put("level:since_report", "percent", head["since_report"])
    lv = head["levels"]
    if lv:
        levels = levels_of(lv)
        put("level:report_price", "price", lv["report_price"])
        for name in ("bear", "base", "bull"):
            put(f"level:{name}", "price", lv[name])
        # A red flag holds the rating at Hold whatever the price: no price turns it either way.
        if not lv["capped"]:
            put("level:buy_trigger", "price", levels.trigger("buy"))
            put("level:sell_trigger", "price", levels.trigger("sell"))
        put("level:report_date", "date", lv["report_date"])

    sector = snapshot["sector"]
    if _usable(sector):
        for row in sector["returns"]:
            period = row["period"].lower()
            put(f"dig:stock_{period}", "percent", row["stock"])
            put(f"dig:sector_{period}", "percent", row["sector_median"])
            put(f"dig:spy_{period}", "percent", row["spy"])
        put("dig:sector_rank", "count", sector["rank"])
        put("dig:sector_members", "count", sector["rank_of"])

    market = snapshot["market"]
    if _usable(market):
        put("dig:spy_12m", "percent", market["spy_12m"])
        put("dig:volatility_percentile", "count", market["volatility_percentile"])

    rates = snapshot["rates"]
    if _usable(rates):
        for rate in rates["rates"]:
            put(f"macro:{rate['id']}", "percent", rate["value"])

    peers = snapshot["peers"]
    if _usable(peers):
        company = next((r for r in peers["rows"] if r["is_company"]), None)
        for column in peers["columns"]:
            key = column["key"]
            kind = "ratio" if key in MULTIPLES else "percent"
            if company is not None:
                put(f"metric:{key}", kind, company["numbers"].get(key))
            put(f"peer_median:{key}", kind, peers["median"].get(key))
        if company is not None:
            put("dig:score", "count", company["score"])
        put("dig:peer_median_score", "count", peers["median"].get("score"))
        put("dig:peer_count", "count", sum(1 for r in peers["rows"] if not r["is_company"]))

    analysts = snapshot["analysts"]
    view = analysts.get("view")
    if _usable(analysts) and view and view.get("state") == "ok":
        put("dig:analyst_firms", "count", view.get("n_firms"))
        for side, count in (view.get("sides") or {}).items():
            put(f"dig:analyst_{side}", "count", count)
        target = view.get("target") or {}
        for name in ("median", "low", "high"):
            put(f"dig:analyst_target_{name}", "price", target.get(name))

    insiders = snapshot["insiders"]
    if _usable(insiders):
        for side, word in (("buys", "buy"), ("sells", "sell")):
            trades = insiders[side]
            if trades is not None:
                put(f"dig:insider_{side}", "count", trades["trades"])
                if trades["value"] > 0:
                    put(f"dig:insider_{word}_value", "amount", trades["value"])

    news = snapshot["news"]
    if _usable(news):
        for tone in ("positive", "neutral", "negative"):
            put(f"dig:news_{tone}", "count", news["tone"][tone])
    return out


def price_line(snapshot: dict[str, Any]) -> tuple[str, str | None]:
    """The Next move box's first line, and today's close beside a Buy price. Code writes it,
    from the report's numbers; the AI never sets a price."""
    head = snapshot["header"]
    lv = head["levels"]
    if lv is None:
        return "The report has no Buy price.", None
    if lv["capped"]:
        return "A red flag holds our rating at Hold, whatever the price.", None
    buy = levels_of(lv).trigger("buy")
    if buy is not None:
        line = f"Our numbers turn Buy at {format_value('price', buy)}"
        close = head["close"]
        if close is None:
            return line, None
        today = f"Today’s close: {format_value('price', close)}"
        return line, f"{today}, below that price" if close <= buy else today
    if lv["buy_reachable"] is False:
        return "No price alone turns our numbers to Buy: the score is below the Buy line.", None
    return "The report has no Buy price.", None
