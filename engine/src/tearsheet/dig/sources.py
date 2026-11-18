"""Dig deeper's take: the sources the AI is given, each with an ID it must cite.

- The report's findings: its checked sentences (business, risks, results, news, trends, what to
  watch), listed in the instructions with the paragraphs they cite, which are sent as sources
  under their own IDs and marks.
- Data paragraphs code writes from the snapshot, `dig:<part>#pN`, from parts that are fresh or
  carried ("ok" or "stale"). A part that is off or down gives none, and the instructions say
  it is missing.
- The news: each article's title, Massive's description (from the snapshot's stored answer)
  and Massive's tone, split into paragraphs that are marked when they read like instructions
  (`text.parse.split_paragraphs`). The analysts' figures were saved before the AI call, with the
  snapshot (`AnalystDB.saved_view`).

Report paragraphs are capped so the sources stay well inside the AI's time limit; a cut says so."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from tearsheet import config
from tearsheet.dig.levels import MULTIPLES, USABLE, levels_of
from tearsheet.rawstore import RawStore
from tearsheet.render import format_value
from tearsheet.text.parse import Paragraph, split_paragraphs

REPORT_KEYS = ("business", "risks", "results", "news", "trends", "watch")
REPORT_PARAGRAPHS = 40
NEWS_ITEMS = 25
SOURCE_CHARS = 90_000
PEERS_LISTED = 10
CHANGES_LISTED = 8
PART_LABELS = {
    "today": "Today",
    "sector": "Sector",
    "market": "Market",
    "rates": "Rates",
    "peers": "Peers",
    "analysts": "Analysts",
    "insiders": "Insiders",
    "news": "News",
}


@dataclass
class TakeSources:
    paragraphs: dict[str, Paragraph] = field(default_factory=dict)
    # A chip's label and its link (None when it has none, or it doesn't open).
    labels: dict[str, tuple[str, str | None]] = field(default_factory=dict)
    findings: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    cuts: list[str] = field(default_factory=list)


def _price(v: float | None) -> str:
    return format_value("price", v)


def _pct(v: float | None) -> str:
    return format_value("percent", v)


def _day(text: str | None) -> str:
    return format_value("date", text[:10]) if text else "an unknown date"


def _short_day(text: str) -> str:
    d = date.fromisoformat(text[:10])
    return f"{d.day} {d:%b}"


def _nth(n: float) -> str:
    n = round(n)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _move(v: float | None) -> str:
    if v is None:
        return "not available"
    if v == 0:
        return "flat"
    return f"{'up' if v > 0 else 'down'} {_pct(abs(v))}"


def _plural(n: int, one: str, many: str) -> str:
    return f"{n:,} {one if n == 1 else many}"


# --- the data paragraphs ------------------------------------------------------------------


def _today(snapshot: dict[str, Any]) -> list[str]:
    head = snapshot["header"]
    lv = head["levels"]
    out = []
    if head["close"] is not None:
        line = f"{head['name']} ({head['ticker']}) closed at {_price(head['close'])} on {_day(head['close_date'])}"
        since = head["since_report"]
        if lv and since is not None:
            side = "above" if since >= 0 else "below"
            then = f" ({_price(lv['report_price'])})" if lv["report_price"] is not None else ""
            line += f", {_pct(abs(since))} {side} its price at the report on {_day(lv['report_date'])}{then}"
        out.append(line + ".")
    if not lv:
        return out
    rated = f"The report rated it {lv['rating']}" if lv["rating"] else "The report gave no rating"
    if lv["base"] is not None:
        rated += f", with a base value of {_price(lv['base'])}"
        if lv["bear"] is not None and lv["bull"] is not None:
            rated += f" and a range of {_price(lv['bear'])} (bear) to {_price(lv['bull'])} (bull)"
    rated += "."
    if lv["capped"]:
        rated += " A red flag holds the rating at Hold."
    if lv["score_percentile"] is not None:
        rated += f" Its score was at the {_nth(lv['score_percentile'])} percentile of its peers"
        rated += f", with {lv['uncertainty']} uncertainty." if lv["uncertainty"] else "."
    out.append(rated)
    levels = levels_of(lv)
    turns = [
        f"{word} at {_price(price)}"
        for word, price in (("Buy", levels.trigger("buy")), ("Sell", levels.trigger("sell")))
        if price is not None
    ]
    lines = []
    if turns:
        lines.append(
            f"Our numbers turn {' and '.join(turns)}, holding the score and the peers’ values fixed."
        )
    if lv["buy_reachable"] is False:
        lines.append("Buy isn’t reachable by price alone: the score is below the Buy line.")
    if lv["sell_reachable"] is False:
        lines.append("Sell isn’t reachable by price alone: the score is above the Sell line.")
    if lines:
        out.append(" ".join(lines))
    return out


def _sector(part: dict[str, Any]) -> list[str]:
    by = {r["period"]: r for r in part["returns"]}
    lines = []
    for period, words in (
        ("12M", "12 months"),
        ("6M", "6 months"),
        ("3M", "3 months"),
        ("1M", "1 month"),
    ):
        r = by.get(period)
        if r:
            lines.append(
                f"Over {words}: the stock {_pct(r['stock'])}, the sector’s median member "
                f"{_pct(r['sector_median'])}, SPY {_pct(r['spy'])}."
            )
    out = []
    if lines:
        out.append("Total returns to the last close. " + " ".join(lines))
    if part["rank"] is not None and part["rank_of"]:
        rank = (
            f"It ranks {_nth(part['rank'])} of {part['rank_of']} {part['sector'] or 'sector'}"
            " members by 12-month return (1st is best)."
        )
        if part["left_out"]:
            rank += f" {_plural(part['left_out'], 'member', 'members')} with less than a year of prices left out."
        out.append(rank)
    return out


def _market(part: dict[str, Any]) -> list[str]:
    words = []
    if part["spy_12m"] is not None:
        words.append(f"SPY’s 12-month return: {_pct(part['spy_12m'])}.")
    if part["volatility_percentile"] is not None:
        words.append(
            f"Market volatility is at the {_nth(part['volatility_percentile'])} percentile."
        )
    if part["scaling_note"]:
        words.append(part["scaling_note"])
    return [" ".join(words)] if words else []


def _rates(part: dict[str, Any]) -> list[str]:
    lines = [f"{r['label']}: {_pct(r['value'])} ({_day(r['date'])})." for r in part["rates"]]
    return [" ".join(lines)] if lines else []


def _metric(key: str, v: float | None) -> str:
    return format_value("ratio" if key in MULTIPLES else "percent", v)


def _peers(part: dict[str, Any]) -> list[str]:
    company = next((r for r in part["rows"] if r["is_company"]), None)
    others = [r for r in part["rows"] if not r["is_company"]]
    out = []
    head = f"As of the report ({_day(part['report_date'])}), in a group of {_plural(len(others), 'peer', 'peers')}"
    if company is not None and company["score"] is not None:
        head += f", its score is {format_value('count', company['score'])}"
        if part["median"].get("score") is not None:
            head += f" (the peers’ median {format_value('count', part['median']['score'])})"
    head += "."
    if part["recomputed_note"]:
        head += f" {part['recomputed_note']}"
    out.append(head)
    if company is not None and part["columns"]:
        numbers = []
        for col in part["columns"]:
            key = col["key"]
            mine = _metric(key, company["numbers"].get(key))
            median = part["median"].get(key)
            beside = (
                f"peers’ median {_metric(key, median)}" if median is not None else "no peer median"
            )
            numbers.append(f"{col['label']}: {mine} ({beside}).")
        out.append(" ".join(numbers))
    for r in others[:PEERS_LISTED]:
        line = f"{r['name']} ({r['ticker']}): score {format_value('count', r['score'])}"
        line += (
            f"; rated {r['rating']} on {_day(r['rated_at'])}"
            if r["rating"]
            else "; no official rating"
        )
        line += f"; {_move(r['since_report'])} since its report; {_move(r['return_12m'])} over 12 months."
        out.append(line)
    return out


def _analysts(part: dict[str, Any]) -> list[str]:
    view = part["view"] or {}
    out = []
    if view.get("state") == "ok":
        sides = view.get("sides") or {}
        line = (
            f"{_plural(view.get('n_firms') or 0, 'firm covers', 'firms cover')} it: "
            f"{sides.get('buy', 0)} on the buy side, {sides.get('hold', 0)} hold, {sides.get('sell', 0)} sell."
        )
        target = view.get("target") or {}
        if target.get("median") is not None:
            line += f" Their median price target is {_price(target['median'])}"
            if target.get("low") is not None and target.get("high") is not None:
                line += f", from {_price(target['low'])} to {_price(target['high'])}"
            if target.get("mean") is not None:
                line += f" (mean {_price(target['mean'])})"
            line += "."
        out.append(line)
    ours = part["ours"]
    if ours and ours["base"] is not None:
        line = f"Our report’s base value is {_price(ours['base'])}"
        if ours["bear"] is not None and ours["bull"] is not None:
            line += f", in a range of {_price(ours['bear'])} to {_price(ours['bull'])}"
        out.append(line + ".")
    changes = (view.get("changes") or [])[:CHANGES_LISTED]
    if changes:
        out.append("Recent changes: " + " ".join(c["readout"] for c in changes))
    return out


def _side(side: dict[str, Any] | None, one: str, many: str) -> str:
    if side is None or not side["trades"]:
        return f"no {many}"
    detail = [
        _plural(side["people"], "person", "people"),
        f"{format_value('count', side['shares'])} shares",
    ]
    if side["value"] > 0:
        detail.append(format_value("amount", side["value"]))
    return f"{_plural(side['trades'], one, many)} ({', '.join(detail)})"


def _insiders(part: dict[str, Any]) -> list[str]:
    out = [
        f"Over the last {part['days']} days, insiders made "
        f"{_side(part['buys'], 'open-market purchase', 'open-market purchases')} and "
        f"{_side(part['sells'], 'sale', 'sales')}."
    ]
    if part["routine_free_buyers"]:
        out.append(
            "Bought outside a yearly routine: " + ", ".join(part["routine_free_buyers"]) + "."
        )
    return out


_WRITERS = {
    "sector": _sector,
    "market": _market,
    "rates": _rates,
    "peers": _peers,
    "analysts": _analysts,
    "insiders": _insiders,
}


def _data(out: TakeSources, snapshot: dict[str, Any]) -> None:
    def add(part: str, lines: list[str]) -> None:
        for n, text in enumerate(lines, start=1):
            pid = f"dig:{part}#p{n}"
            out.paragraphs[pid] = Paragraph(pid, f"dig:{part}", part, n, text, False)
            out.labels[pid] = (f"Tearsheet data: {PART_LABELS[part]}", None)

    add("today", _today(snapshot))
    for part, write in _WRITERS.items():
        data = snapshot[part]
        if data["state"] in USABLE:
            add(part, write(data))
        else:
            out.missing.append(
                f"{PART_LABELS[part]}: not available ({data['note'] or 'no answer'})"
            )


# --- the news -----------------------------------------------------------------------------


def _descriptions(conn: sqlite3.Connection, raw_dir: Path, snapshot_id: str) -> dict[str, str]:
    """Each article's description from the snapshot's stored Massive answer, by its address."""
    row = conn.execute(
        "SELECT raw_hash FROM fetch_log WHERE run_id = ? AND request_key LIKE ?"
        " ORDER BY fetch_id DESC LIMIT 1",
        (snapshot_id, f"%{config.MASSIVE_NEWS}%"),
    ).fetchone()
    if row is None:
        return {}
    try:
        data = json.loads(RawStore.read(raw_dir, row[0]))
    except (OSError, ValueError):
        return {}
    out = {}
    for article in data.get("results") or []:
        if isinstance(article, dict) and article.get("article_url") and article.get("description"):
            out[str(article["article_url"])] = " ".join(str(article["description"]).split())
    return out


def _news(
    out: TakeSources, conn, raw_dir: Path, snapshot: dict[str, Any], phrases: list[str]
) -> None:
    news = snapshot["news"]
    if news["state"] not in USABLE:
        out.missing.append(f"News: not available ({news['note'] or 'no answer'})")
        return
    described = _descriptions(conn, raw_dir, snapshot["snapshot_id"])
    ticker = snapshot["header"]["ticker"]
    for item in news["items"][:NEWS_ITEMS]:
        blocks = [item["title"]]
        if described.get(item["url"]):
            blocks.append(described[item["url"]])
        if item["tone"]:
            why = f" {item['tone_why']}" if item["tone_why"] else ""
            blocks.append(f"Massive’s tone for {ticker}: {item['tone']}.{why}")
        source_id = "news-" + hashlib.sha1(item["url"].encode()).hexdigest()[:10]
        label = f"News: {item['publisher'] or 'unknown publisher'}, {_short_day(item['published'])}"
        link = item["url"] if item["openable"] else None
        for p in split_paragraphs(source_id, "article", "\n\n".join(blocks), phrases):
            out.paragraphs[p.id] = p
            out.labels[p.id] = (label, link)


# --- the report ---------------------------------------------------------------------------


def _report_label(pid: str) -> str:
    parts = pid.split("#")
    return (
        f"Report source: {parts[1].replace('_', ' ')}"
        if len(parts) >= 3
        else "Report source: article"
    )


def _report(out: TakeSources, conn: sqlite3.Connection, report_id: str | None) -> None:
    if report_id is None:
        return
    rows = dict(
        conn.execute(
            "SELECT key, json FROM sections WHERE report_id = ? AND key IN"
            f" ({', '.join('?' for _ in REPORT_KEYS)})",
            (report_id, *REPORT_KEYS),
        ).fetchall()
    )
    sentences: list[tuple[str, dict[str, Any]]] = []
    cited: dict[str, tuple[dict[str, Any], str]] = {}
    for key in REPORT_KEYS:
        if key not in rows:
            continue
        for sentence in json.loads(rows[key]).get("sentences") or []:
            sentences.append((key, sentence))
            for c in sentence.get("citations") or []:
                if c.get("id") and c.get("text"):
                    cited.setdefault(c["id"], (c, key))
    room = SOURCE_CHARS - sum(len(p.text) for p in out.paragraphs.values())
    kept: list[str] = []
    for pid, (c, _) in cited.items():
        if len(kept) >= REPORT_PARAGRAPHS or len(c["text"]) > room:
            continue
        kept.append(pid)
        room -= len(c["text"])
    if len(kept) < len(cited):
        out.cuts.append(
            f"Left out {len(cited) - len(kept)} of the report’s {len(cited)} cited paragraphs"
            " to keep the sources short."
        )
    marks = (
        dict(
            conn.execute(
                f"SELECT id, marked FROM paragraphs WHERE id IN ({', '.join('?' for _ in kept)})",
                kept,
            ).fetchall()
        )
        if kept
        else {}
    )
    for n, pid in enumerate(kept, start=1):
        c, key = cited[pid]
        source = pid.split("#", 1)[0] if "#" in pid else pid.rsplit("-p", 1)[0]
        out.paragraphs[pid] = Paragraph(pid, source, key, n, c["text"], bool(marks.get(pid)))
        out.labels[pid] = (_report_label(pid), c.get("url") or None)
    keep = set(kept)
    for key, sentence in sentences:
        ids = [c["id"] for c in sentence.get("citations") or [] if c.get("id") in keep]
        if ids and sentence.get("text"):
            out.findings.append(f"- [{key}] {sentence['text']} (cites: {', '.join(ids)})")


def take_sources(
    conn: sqlite3.Connection, raw_dir: Path, snapshot: dict[str, Any], method
) -> TakeSources:
    out = TakeSources()
    phrases = list(method.instruction_phrases.get("patterns", []))
    _data(out, snapshot)
    _news(out, conn, raw_dir, snapshot, phrases)
    _report(out, conn, snapshot["report_id"])
    return out
