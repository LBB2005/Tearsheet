"""The watchlist: lists of S&P 500 companies to follow, each with its note and alerts.

Companies are kept by CIK, never by ticker; the ticker shown is worked out when the page is read
(the bundled S&P 500 list's rated ticker, else the newest stored ticker, else what was typed).
A company's note and alert settings belong to the company (`watch_companies`), not to a list,
so they survive it leaving every list and come back when it is added again. "Watched" means in
at least one live list; a deleted list is kept until its undo has passed, then erased.

Every number on the page is worked out here, from the company's newest report on show (hidden
reports are left out, as in the sidebar) or, with none on show, its newest official prediction,
with every price in the last close's shares (a split since the report divides the report's
levels). Alerts are measured on daily closes: `evaluate` walks the closes stored since it last
looked, keeps where each alert stood (`watch_alert_state`), and writes one event per crossing
(`watch_events`, whose UNIQUE key makes a second look add nothing). A new or erased report, the
company being added, or an alert being turned on starts it again silently from the newest close.

The rating-change prices ("triggers") are what-ifs: the price where the rating would change with
the score and the peers' value gaps held fixed. A red flag holds the rating at Hold whatever the
price, and a trigger that isn't reachable by price alone gives no alert. Every sentence the page,
the alert history and the Mac notification show is written here.

Only the engine writes these tables, each write in one `with conn:` block with nothing awaited
inside, as report_marks.py does.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from tearsheet.data import membership
from tearsheet.data.prices import last_completed_session, previous_session, split_factor_after
from tearsheet.predictions import WINDOW
from tearsheet.render import format_value

# The list made on first use when none exists.
DEFAULT_NAME = "Watchlist"
NAME_MAX = 60
# A deleted list whose undo was never answered (the window closed) is erased at the next start
# once it has been deleted this long.
ERASE_AFTER = timedelta(days=1)
# The most closes one look walks for a company: a long absence alerts on the latest month.
MAX_WALK = 30
# A reachable trigger this close to the price (as a move from it) is worth a look.
NEAR_TRIGGER = 0.10
# The move that marks a row "moved" when the company's move alert is off.
DEFAULT_MOVE = 0.10
PRICE_KINDS = ("range", "trigger_buy", "trigger_sell", "move")

# The companies in at least one live list.
_WATCHED = (
    "SELECT DISTINCT i.cik FROM watch_items i"
    " JOIN watch_lists l ON l.list_id = i.list_id AND l.deleted_at IS NULL"
)


def _iso(now: datetime) -> str:
    return now.astimezone(UTC).isoformat()


def _when(text: str) -> datetime:
    stamp = datetime.fromisoformat(text)
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=UTC)


def _money(value: float) -> str:
    return format_value("price", value)


def _pct(value: float) -> str:
    return format_value("percent", abs(value))


def _day(text: str) -> str:
    return format_value("date", text[:10])


# --- lists ------------------------------------------------------------------------------------


def _live_list(conn: sqlite3.Connection, list_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM watch_lists WHERE list_id = ? AND deleted_at IS NULL", (list_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"There is no watchlist {list_id} (it may have been deleted).")
    return row


def _list_ciks(conn: sqlite3.Connection, list_id: int) -> list[int]:
    return [
        int(r[0])
        for r in conn.execute(
            "SELECT cik FROM watch_items WHERE list_id = ? ORDER BY position, cik", (list_id,)
        )
    ]


def _list_out(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    """A list as protocol.WatchList: its companies in their saved order."""
    ciks = _list_ciks(conn, row["list_id"])
    return {
        "list_id": row["list_id"],
        "name": row["name"],
        "position": row["position"],
        "count": len(ciks),
        "ciks": ciks,
    }


def lists(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """The live lists, in their order."""
    rows = conn.execute(
        "SELECT * FROM watch_lists WHERE deleted_at IS NULL ORDER BY position, list_id"
    ).fetchall()
    return [_list_out(conn, r) for r in rows]


def _clean_name(conn: sqlite3.Connection, name: str, *, keep: int | None = None) -> str:
    clean = name.strip()
    if not clean:
        raise ValueError("A watchlist needs a name.")
    if len(clean) > NAME_MAX:
        raise ValueError(f"A watchlist's name can be at most {NAME_MAX} characters.")
    for row in conn.execute(
        "SELECT list_id, name FROM watch_lists WHERE deleted_at IS NULL AND list_id != ?",
        (keep if keep is not None else -1,),
    ):
        if row["name"].casefold() == clean.casefold():
            raise ValueError(f"A watchlist called '{row['name']}' already exists.")
    return clean


def _insert_list(conn: sqlite3.Connection, name: str, now: datetime) -> int:
    position = conn.execute(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM watch_lists WHERE deleted_at IS NULL"
    ).fetchone()[0]
    try:
        cursor = conn.execute(
            "INSERT INTO watch_lists (name, position, created_at) VALUES (?, ?, ?)",
            (name, position, _iso(now)),
        )
    except sqlite3.IntegrityError as exc:  # the live-name index, for a name only SQLite matches
        raise ValueError(f"A watchlist called '{name}' already exists.") from exc
    return int(cursor.lastrowid)


def create(conn: sqlite3.Connection, name: str, now: datetime) -> dict[str, Any]:
    clean = _clean_name(conn, name)
    with conn:
        list_id = _insert_list(conn, clean, now)
    return _list_out(conn, _live_list(conn, list_id))


def rename(conn: sqlite3.Connection, list_id: int, name: str) -> dict[str, Any]:
    _live_list(conn, list_id)
    clean = _clean_name(conn, name, keep=list_id)
    try:
        with conn:
            conn.execute("UPDATE watch_lists SET name = ? WHERE list_id = ?", (clean, list_id))
    except sqlite3.IntegrityError as exc:
        raise ValueError(f"A watchlist called '{clean}' already exists.") from exc
    return _list_out(conn, _live_list(conn, list_id))


def order_lists(conn: sqlite3.Connection, list_ids: list[int]) -> list[dict[str, Any]]:
    """Put the live lists in the order given, which must name each of them once."""
    live = {r[0] for r in conn.execute("SELECT list_id FROM watch_lists WHERE deleted_at IS NULL")}
    if len(list_ids) != len(set(list_ids)) or set(list_ids) != live:
        raise ValueError("The order must name every watchlist once.")
    with conn:
        for position, list_id in enumerate(list_ids):
            conn.execute(
                "UPDATE watch_lists SET position = ? WHERE list_id = ?", (position, list_id)
            )
    return lists(conn)


def delete(conn: sqlite3.Connection, list_id: int, now: datetime) -> dict[str, Any]:
    """Delete a list, for now: `restore` brings it back, `erase` ends it. Says which of its
    companies are in no other live list (they leave the watchlist) and which of those have a
    note (kept, and back if the company is added again)."""
    _live_list(conn, list_id)
    members = _list_ciks(conn, list_id)
    elsewhere = {
        int(r[0])
        for r in conn.execute(
            "SELECT DISTINCT i.cik FROM watch_items i JOIN watch_lists l"
            " ON l.list_id = i.list_id AND l.deleted_at IS NULL WHERE i.list_id != ?",
            (list_id,),
        )
    }
    leaving = [cik for cik in members if cik not in elsewhere]
    noted = {int(r[0]) for r in conn.execute("SELECT cik FROM watch_companies WHERE note != ''")}
    with conn:
        conn.execute(
            "UPDATE watch_lists SET deleted_at = ? WHERE list_id = ?", (_iso(now), list_id)
        )
    return {
        "list_id": list_id,
        "leaving": leaving,
        "with_notes": [cik for cik in leaving if cik in noted],
    }


def _deleted_list(conn: sqlite3.Connection, list_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM watch_lists WHERE list_id = ? AND deleted_at IS NOT NULL", (list_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"There is no deleted watchlist {list_id}.")
    return row


def restore(conn: sqlite3.Connection, list_id: int) -> None:
    """The undo of `delete`."""
    row = _deleted_list(conn, list_id)
    _clean_name(conn, row["name"])  # a list made since with its name keeps it
    with conn:
        conn.execute("UPDATE watch_lists SET deleted_at = NULL WHERE list_id = ?", (list_id,))


def erase(conn: sqlite3.Connection, list_id: int) -> None:
    """Erase a deleted list for good (its undo has passed). Its companies' notes and alert
    settings stay with the companies."""
    _deleted_list(conn, list_id)
    with conn:
        conn.execute("DELETE FROM watch_lists WHERE list_id = ?", (list_id,))


def erase_old(conn: sqlite3.Connection, now: datetime) -> int:
    """Erase lists deleted more than ERASE_AFTER ago whose undo was never answered."""
    cutoff = _iso(now - ERASE_AFTER)
    with conn:
        gone = conn.execute(
            "DELETE FROM watch_lists WHERE deleted_at IS NOT NULL AND deleted_at < ?", (cutoff,)
        )
    return gone.rowcount


# --- companies in lists -----------------------------------------------------------------------


def watched(conn: sqlite3.Connection) -> set[int]:
    return {int(r[0]) for r in conn.execute(_WATCHED)}


def _require_watched(conn: sqlite3.Connection, ciks: Iterable[int]) -> list[int]:
    found = watched(conn)
    wanted = list(dict.fromkeys(ciks))
    for cik in wanted:
        if cik not in found:
            raise ValueError(f"The company with CIK {cik} isn't in a watchlist.")
    return wanted


def _short_name(name: str) -> str:
    """A name without its share-class tag: "Alphabet Inc. (Class C)" is "Alphabet Inc."."""
    return re.sub(r"\s*\(Class [A-Z]\)\s*$", "", name).strip() or name


def add(
    conn: sqlite3.Connection, list_id: int | None, queries: list[str], now: datetime
) -> dict[str, Any]:
    """Add companies to a list (the first live list, made as "Watchlist" if there is none, when
    `list_id` is None). Each query is looked up as the line looks it up: tickers pasted with
    spaces between them split, then the bundled S&P 500 list by ticker, brand alias and name.
    Left out: what matches no S&P 500 company, a company listed twice, one already in the list.
    A company that wasn't watched forgets where its alerts stood, so the next `evaluate` starts
    them silently from the newest close."""
    from tearsheet.batch import ReportLine
    from tearsheet.companies import _aliases
    from tearsheet.resolve import NotCovered, canonical_ticker, resolve

    target = (
        _live_list(conn, list_id)
        if list_id is not None
        else conn.execute(
            "SELECT * FROM watch_lists WHERE deleted_at IS NULL ORDER BY position, list_id LIMIT 1"
        ).fetchone()
    )
    list_name = target["name"] if target is not None else DEFAULT_NAME
    in_list = set(_list_ciks(conn, target["list_id"])) if target is not None else set()
    holdings = membership.load_bundled()
    tickers = {row.ticker: row.cik for row in holdings.rows}
    aliases = _aliases()
    added: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    typed: dict[int, str] = {}
    for raw in queries:
        query = raw.strip()
        if not query:
            continue
        for piece in ReportLine._pieces(query, tickers, holdings, aliases):
            try:
                found = resolve(piece, tickers, holdings, aliases=aliases)
            except NotCovered as exc:
                reason = str(exc)
                if exc.candidates:
                    reason += " Did you mean " + " or ".join(exc.candidates) + "?"
                skipped.append({"query": piece, "reason": reason, "kind": "unknown"})
                continue
            ticker = found.rated_ticker
            if found.cik in typed:
                skipped.append(
                    {"query": piece, "reason": f"{ticker} is listed twice.", "kind": "twice"}
                )
                continue
            if found.cik in in_list:
                skipped.append(
                    {
                        "query": piece,
                        "reason": f"{ticker} is already in {list_name}.",
                        "kind": "in_list",
                    }
                )
                continue
            typed[found.cik] = piece
            spelled = canonical_ticker(piece)
            note = (
                f"{spelled} is followed as {_short_name(found.name)}, priced as {ticker}."
                if found.matched_by == "ticker" and spelled != ticker
                else None
            )
            added.append({"cik": found.cik, "ticker": ticker, "name": found.name, "note": note})
    before = watched(conn)
    at = _iso(now)
    with conn:
        if target is None:
            target_id = _insert_list(conn, DEFAULT_NAME, now)
        else:
            target_id = target["list_id"]
        position = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM watch_items WHERE list_id = ?",
            (target_id,),
        ).fetchone()[0]
        for item in added:
            cik = item["cik"]
            conn.execute(
                "INSERT OR IGNORE INTO watch_companies (cik, first_added_at) VALUES (?, ?)",
                (cik, at),
            )
            conn.execute(
                "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
                " VALUES (?, ?, ?, ?, ?)",
                (target_id, cik, position, at, typed[cik]),
            )
            position += 1
            if cik not in before:
                # Back after leaving every list: what happened meanwhile isn't news.
                conn.execute("DELETE FROM watch_alert_state WHERE cik = ?", (cik,))
    return {
        "list": _list_out(conn, _live_list(conn, target_id)),
        "added": added,
        "skipped": skipped,
    }


def remove(conn: sqlite3.Connection, list_id: int, ciks: list[int]) -> dict[str, Any]:
    """Take companies out of a list. Returns what the undo (`restore_items`) puts back."""
    _live_list(conn, list_id)
    wanted = set(ciks)
    rows = [
        r
        for r in conn.execute(
            "SELECT cik, position, added_at, added_as FROM watch_items WHERE list_id = ?"
            " ORDER BY position, cik",
            (list_id,),
        )
        if r["cik"] in wanted
    ]
    with conn:
        for r in rows:
            conn.execute(
                "DELETE FROM watch_items WHERE list_id = ? AND cik = ?", (list_id, r["cik"])
            )
    return {
        "removed": [
            {
                "cik": r["cik"],
                "position": r["position"],
                "added_at": r["added_at"],
                "added_as": r["added_as"],
            }
            for r in rows
        ]
    }


def restore_items(conn: sqlite3.Connection, list_id: int, items: list[dict[str, Any]]) -> None:
    """The undo of `remove`: each company back where it was, with the date it was added."""
    _live_list(conn, list_id)
    known = {int(r[0]) for r in conn.execute("SELECT cik FROM watch_companies")}
    for item in items:
        if item["cik"] not in known:
            raise ValueError(f"The company with CIK {item['cik']} has never been watched.")
    with conn:
        for item in items:
            conn.execute(
                "INSERT OR IGNORE INTO watch_items (list_id, cik, position, added_at, added_as)"
                " VALUES (?, ?, ?, ?, ?)",
                (list_id, item["cik"], item["position"], item["added_at"], item["added_as"]),
            )


def order_items(conn: sqlite3.Connection, list_id: int, ciks: list[int]) -> None:
    """Put a list's companies in the order given, which must name each of them once."""
    _live_list(conn, list_id)
    members = _list_ciks(conn, list_id)
    if len(ciks) != len(set(ciks)) or set(ciks) != set(members):
        raise ValueError("The order must name every company in the watchlist once.")
    with conn:
        for position, cik in enumerate(ciks):
            conn.execute(
                "UPDATE watch_items SET position = ? WHERE list_id = ? AND cik = ?",
                (position, list_id, cik),
            )


def set_note(conn: sqlite3.Connection, cik: int, note: str, now: datetime) -> dict[str, Any]:
    _require_watched(conn, [cik])
    at = _iso(now)
    with conn:
        conn.execute(
            "UPDATE watch_companies SET note = ?, note_at = ? WHERE cik = ?", (note, at, cik)
        )
    return {"cik": cik, "note_at": at}


def set_alerts(
    conn: sqlite3.Connection,
    ciks: list[int],
    *,
    range_: bool | None = None,
    trigger: bool | None = None,
    move: float | None = None,
    age: bool | None = None,
) -> None:
    """Change the companies' alert settings; a setting left as None is unchanged, and a move of
    0 turns the move alert off. An alert turned off (or a move changed) forgets where it stood, so
    the next `evaluate` starts it again silently from the newest close."""
    wanted = _require_watched(conn, ciks)
    new_move = None if move is None else (move or None)
    with conn:
        for cik in wanted:
            row = conn.execute("SELECT * FROM watch_companies WHERE cik = ?", (cik,)).fetchone()
            forget: list[str] = []
            if range_ is not None and bool(row["alert_range"]) != range_:
                forget.append("range")
            if trigger is not None and bool(row["alert_trigger"]) != trigger:
                forget += ["trigger_buy", "trigger_sell"]
            if move is not None and row["alert_move"] != new_move:
                forget.append("move")
            conn.execute(
                "UPDATE watch_companies SET alert_range = ?, alert_trigger = ?, alert_move = ?,"
                " alert_age = ? WHERE cik = ?",
                (
                    int(range_) if range_ is not None else row["alert_range"],
                    int(trigger) if trigger is not None else row["alert_trigger"],
                    new_move if move is not None else row["alert_move"],
                    int(age) if age is not None else row["alert_age"],
                    cik,
                ),
            )
            for kind in forget:
                conn.execute(
                    "DELETE FROM watch_alert_state WHERE cik = ? AND kind = ?", (cik, kind)
                )


def mark_seen(conn: sqlite3.Connection, ciks: list[int] | None, now: datetime) -> None:
    """Mark alerts seen: the companies' given, or every company's."""
    at = _iso(now)
    with conn:
        if ciks is None:
            conn.execute("UPDATE watch_events SET seen_at = ? WHERE seen_at IS NULL", (at,))
        else:
            for cik in dict.fromkeys(ciks):
                conn.execute(
                    "UPDATE watch_events SET seen_at = ? WHERE seen_at IS NULL AND cik = ?",
                    (at, cik),
                )


# --- what the page shows ------------------------------------------------------------------------


@dataclass(frozen=True)
class Levels:
    """What a company is measured against: its newest report on show, else its newest official
    prediction. Prices are in the shares of `price_date`."""

    ref: str  # the report id, or the prediction id
    report_id: str | None
    report_date: str
    price_date: date
    official: bool
    rating: str | None
    capped: bool
    report_price: float | None
    bear: float | None
    base: float | None
    bull: float | None
    buy: float | None
    sell: float | None
    buy_reachable: bool | None
    sell_reachable: bool | None
    score_percentile: int | None
    uncertainty: str | None
    source: str

    @property
    def what(self) -> str:
        return "report" if self.report_id is not None else "prediction"

    def trigger(self, side: str) -> float | None:
        """A trigger that can alert: reachable by price, with a price."""
        if side == "buy":
            return self.buy if self.buy_reachable else None
        return self.sell if self.sell_reachable else None

    def met_at_report(self, side: str) -> bool:
        """Whether the report's price met the Buy (or Sell) gap condition. A capped rating's
        uncapped call is the one non-Hold call its reachable trigger allows."""
        call = "Buy" if side == "buy" else "Sell"
        if self.capped:
            other = self.trigger("sell" if side == "buy" else "buy")
            if other is None or self.report_price is None:
                return True
            return _met(side, self.report_price, self.trigger(side) or 0.0, None) is True
        return self.rating == call


def _met(side: str, close: float, level: float, before: bool | None) -> bool | None:
    """Whether a close meets the Buy (or Sell) gap condition: below the buy trigger, above the
    sell trigger. A close exactly on the trigger keeps what it was before (None at first)."""
    if close == level:
        return before
    return close < level if side == "buy" else close > level


def _would(side: str, met: bool, levels: Levels) -> str:
    """What the rating would be with the price on that side of the trigger, the score and the
    peers' value gaps held fixed."""
    call = "Buy" if side == "buy" else "Sell"
    if levels.capped:
        if met:
            return f"the rating would turn {call}, but a red flag holds it at Hold"
        return f"it would no longer meet the {call} line; a red flag holds the rating at Hold either way"
    before = levels.met_at_report(side)
    if met and not before:
        return f"the rating would turn {call}"
    if not met and before:
        return "the rating would fall back to Hold"
    if met:
        return f"the rating would be {call} again, as in the {levels.what}"
    return f"the rating would be Hold again, as in the {levels.what}"


def _splits(conn: sqlite3.Connection) -> dict[int, dict[date, float]]:
    """Every watched company's splits, as PriceStore.splits gives one company's."""
    out: dict[int, dict[date, float]] = {}
    for cik, day, ratio in conn.execute(
        "SELECT cik, date, ratio_or_amount FROM corporate_actions"
        f" WHERE kind = 'split' AND share_class = '' AND cik IN ({_WATCHED})"
    ):
        mine = out.setdefault(int(cik), {})
        when = date.fromisoformat(day)
        mine[when] = mine.get(when, 1.0) * float(ratio)
    return out


def _recent(conn: sqlite3.Connection, cik: int, limit: int = 2) -> list[tuple[date, float]]:
    return [
        (date.fromisoformat(r[0]), float(r[1]))
        for r in conn.execute(
            "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ''"
            " ORDER BY date DESC LIMIT ?",
            (cik, limit),
        )
    ]


def _close_up_to(conn: sqlite3.Connection, cik: int, day: date) -> tuple[date, float] | None:
    row = conn.execute(
        "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ''"
        " AND date <= ? ORDER BY date DESC LIMIT 1",
        (cik, day.isoformat()),
    ).fetchone()
    return (date.fromisoformat(row[0]), float(row[1])) if row else None


def _closes_after(conn: sqlite3.Connection, cik: int, day: str) -> list[tuple[date, float]]:
    """The closes stored after `day`, oldest first: the latest MAX_WALK of them."""
    rows = conn.execute(
        "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ''"
        " AND date > ? ORDER BY date DESC LIMIT ?",
        (cik, day, MAX_WALK),
    ).fetchall()
    return [(date.fromisoformat(r[0]), float(r[1])) for r in reversed(rows)]


@dataclass
class _Company:
    """One watched company as stored: its lists, settings, report and prediction."""

    cik: int
    row: sqlite3.Row
    lists: list[int]
    added_at: str
    order: tuple
    added_as: str
    levels: Levels | None
    # The close the report (or prediction) was priced at, for the move since it.
    then: tuple[date, float] | None
    made_at: str | None  # the report's created_at, or the prediction's run_at
    prediction: sqlite3.Row | None

    @property
    def move_alert(self) -> float | None:
        value = self.row["alert_move"]
        return float(value) if value is not None else None


def _levels_from_row(row: sqlite3.Row) -> Levels | None:
    if row["report_id"] is None or row["lv_price_date"] is None:
        return None

    def reach(value: Any) -> bool | None:
        return None if value is None else bool(value)

    return Levels(
        ref=row["report_id"],
        report_id=row["report_id"],
        report_date=row["report_created_at"][:10],
        price_date=date.fromisoformat(row["lv_price_date"]),
        official=bool(row["official"]),
        rating=row["lv_rating"],
        capped=bool(row["lv_capped"]),
        report_price=row["lv_price"],
        bear=row["lv_bear"],
        base=row["lv_base"],
        bull=row["lv_bull"],
        buy=row["lv_buy_trigger"],
        sell=row["lv_sell_trigger"],
        buy_reachable=reach(row["lv_buy_reachable"]),
        sell_reachable=reach(row["lv_sell_reachable"]),
        score_percentile=row["lv_score_percentile"],
        uncertainty=row["lv_uncertainty"],
        source=row["lv_source"],
    )


def _levels_from_prediction(p: sqlite3.Row, then: tuple[date, float] | None) -> Levels:
    """An official prediction with no report on show (a run that logged it, then stopped
    before its report, or a hidden report): its rating and range, and no triggers."""
    return Levels(
        ref=p["prediction_id"],
        report_id=None,
        report_date=p["run_at"][:10],
        price_date=last_completed_session(_when(p["run_at"])),
        official=True,
        rating=p["rating"],
        capped=False,
        report_price=then[1] if then else None,
        bear=p["bear"],
        base=p["base"],
        bull=p["bull"],
        buy=None,
        sell=None,
        buy_reachable=None,
        sell_reachable=None,
        score_percentile=int(f"{p['score']:.0f}"),
        uncertainty=p["uncertainty"],
        source="prediction",
    )


def _companies(conn: sqlite3.Connection, ciks: Iterable[int] | None = None) -> list[_Company]:
    """Every watched company (or those of `ciks` that are watched), oldest added first."""
    items: dict[int, list[sqlite3.Row]] = {}
    for r in conn.execute(
        "SELECT i.list_id, i.cik, i.position, i.added_at, i.added_as FROM watch_items i"
        " JOIN watch_lists l ON l.list_id = i.list_id AND l.deleted_at IS NULL"
        " ORDER BY l.position, l.list_id, i.position, i.cik"
    ):
        items.setdefault(int(r["cik"]), []).append(r)
    only = set(ciks) if ciks is not None else None
    rows = conn.execute(
        f"WITH watched AS ({_WATCHED}),"
        " shown AS ("
        "  SELECT u.cik, r.report_id, r.run_id, r.created_at, u.started_at,"
        "   ROW_NUMBER() OVER (PARTITION BY u.cik ORDER BY r.created_at DESC, r.rowid DESC) AS n"
        "  FROM reports r JOIN runs u ON u.run_id = r.run_id"
        "  WHERE u.cik IN (SELECT cik FROM watched)"
        "   AND r.report_id NOT IN (SELECT report_id FROM hidden_reports))"
        " SELECT w.cik, c.*, s.report_id, s.run_id, s.created_at AS report_created_at,"
        "  s.started_at,"
        "  EXISTS (SELECT 1 FROM predictions p WHERE p.run_id = s.run_id) AS official,"
        "  EXISTS (SELECT 1 FROM reports r JOIN runs u ON u.run_id = r.run_id"
        "   WHERE u.cik = w.cik) AS any_report,"
        "  (SELECT name FROM companies m WHERE m.cik = w.cik) AS stored_name,"
        "  (SELECT COUNT(*) FROM watch_events e WHERE e.cik = w.cik AND e.seen_at IS NULL)"
        "   AS unseen,"
        "  lv.price_date AS lv_price_date, lv.price AS lv_price, lv.rating AS lv_rating,"
        "  lv.capped AS lv_capped, lv.uncertainty AS lv_uncertainty,"
        "  lv.score_percentile AS lv_score_percentile, lv.bear AS lv_bear, lv.base AS lv_base,"
        "  lv.bull AS lv_bull, lv.buy_trigger AS lv_buy_trigger,"
        "  lv.sell_trigger AS lv_sell_trigger, lv.buy_reachable AS lv_buy_reachable,"
        "  lv.sell_reachable AS lv_sell_reachable, lv.source AS lv_source"
        " FROM watched w JOIN watch_companies c ON c.cik = w.cik"
        " LEFT JOIN shown s ON s.cik = w.cik AND s.n = 1"
        " LEFT JOIN report_levels lv ON lv.report_id = s.report_id"
    ).fetchall()
    newest: dict[int, sqlite3.Row] = {}
    for p in conn.execute(
        f"SELECT * FROM predictions WHERE cik IN ({_WATCHED}) ORDER BY run_at, prediction_id"
    ):
        newest[int(p["cik"])] = p
    out = []
    for row in rows:
        cik = int(row["cik"])
        if only is not None and cik not in only:
            continue
        mine = items[cik]
        first = min(mine, key=lambda r: (r["added_at"], r["position"]))
        prediction = newest.get(cik)
        levels = _levels_from_row(row)
        then = None
        made_at = None
        if row["report_id"] is not None:
            made_at = row["report_created_at"]
            # As the sidebar measures its move (companies.since_report): the last close in
            # when the run started.
            then = _close_up_to(conn, cik, last_completed_session(_when(row["started_at"])))
        elif prediction is not None:
            made_at = prediction["run_at"]
            then = _close_up_to(conn, cik, last_completed_session(_when(prediction["run_at"])))
            levels = _levels_from_prediction(prediction, then)
        out.append(
            _Company(
                cik=cik,
                row=row,
                lists=list(dict.fromkeys(int(r["list_id"]) for r in mine)),
                added_at=first["added_at"],
                order=(first["added_at"], first["position"], cik),
                added_as=first["added_as"],
                levels=levels,
                then=then if then is not None and then[1] > 0 else None,
                made_at=made_at,
                prediction=prediction,
            )
        )
    return sorted(out, key=lambda c: c.order)


def _scaled(value: float | None, factor: float) -> float | None:
    return None if value is None else round(value / factor, 6)


def _at(levels: Levels, splits: dict[date, float], day: date) -> dict[str, float | None]:
    """The levels in `day`'s shares: divided by the splits executed since the report's price
    date."""
    factor = split_factor_after(splits, levels.price_date, up_to=day)
    return {
        "report_price": _scaled(levels.report_price, factor),
        "bear": _scaled(levels.bear, factor),
        "base": _scaled(levels.base, factor),
        "bull": _scaled(levels.bull, factor),
        "buy": _scaled(levels.trigger("buy"), factor),
        "sell": _scaled(levels.trigger("sell"), factor),
        "buy_trigger": _scaled(levels.buy, factor),
        "sell_trigger": _scaled(levels.sell, factor),
    }


def _move(company: _Company, splits: dict[date, float], day: date, close: float) -> float | None:
    """The move from the close the report was priced at, splits taken out (4 places, as the
    sidebar's since-report figure)."""
    if company.then is None:
        return None
    factor = split_factor_after(splits, company.then[0], up_to=day)
    return round(close * factor / company.then[1] - 1, 4)


def _ticker(holdings: membership.Holdings, cik: int, stored: dict[int, str], typed: str) -> str:
    if holdings.has(cik):
        return holdings.tickers_of(cik)[0]
    return stored.get(cik) or typed.strip().upper()


def _stored_tickers(conn: sqlite3.Connection) -> dict[int, str]:
    """Each watched company's newest stored ticker."""
    out: dict[int, str] = {}
    for cik, ticker in conn.execute(
        f"SELECT cik, ticker FROM tickers WHERE cik IN ({_WATCHED}) ORDER BY date_from"
    ):
        out[int(cik)] = ticker
    return out


def _reasons(
    company: _Company,
    *,
    price: tuple[date, float] | None,
    at: dict[str, float | None] | None,
    since: float | None,
    slot_open: bool,
    in_index: bool,
    stale: bool,
) -> tuple[list[dict[str, str]], str | None]:
    """Why the row is worth a look now, most urgent first, and the trigger the price is past."""
    levels = company.levels
    out: dict[str, str] = {}
    past: str | None = None
    if levels is not None and price is not None and at is not None:
        close = price[1]
        near: str | None = None
        for side in ("buy", "sell"):
            level = at[side]
            if level is None:
                continue
            met = bool(_met(side, close, level, None))
            if met != levels.met_at_report(side):
                if past is None:
                    past = side
                    where = "below" if close < level else "above" if close > level else "at"
                    out["trigger"] = (
                        f"Closed at {_money(close)}, {where} its {side} trigger of "
                        f"{_money(level)}. Holding the score and peers fixed, "
                        f"{_would(side, met, levels)}."
                    )
            elif near is None and abs(level / close - 1) <= NEAR_TRIGGER:
                near = (
                    f"{_pct(level / close - 1)} from its {side} trigger of {_money(level)}; past "
                    f"it, holding the score and peers fixed, {_would(side, not met, levels)}."
                )
        bear, base, bull = at["bear"], at["base"], at["bull"]
        if bear is not None and bull is not None and base is not None:
            if close < bear:
                out["outside"] = (
                    f"Closed at {_money(close)}, below the bear case of {_money(bear)} and "
                    f"{_pct(close / base - 1)} below the base case of {_money(base)}."
                )
            elif close > bull:
                out["outside"] = (
                    f"Closed at {_money(close)}, above the bull case of {_money(bull)} and "
                    f"{_pct(close / base - 1)} above the base case of {_money(base)}."
                )
        if near is not None:
            out["near_trigger"] = near
    if since is not None and levels is not None:
        threshold = company.move_alert or DEFAULT_MOVE
        if abs(since) >= threshold:
            way = "Up" if since > 0 else "Down"
            out["moved"] = (
                f"{way} {_pct(since)} since the {_day(levels.report_date)} {levels.what}."
            )
    if slot_open and (levels is not None or company.row["any_report"]):
        out["slot_open"] = "A new report now would be an official prediction."
    if company.row["report_id"] is None and company.prediction is None:
        out["no_report"] = (
            "No report on show: its reports were deleted from the sidebar."
            if company.row["any_report"]
            else "No report yet."
        )
    if not in_index:
        out["left_index"] = "No longer in the S&P 500, so Tearsheet can't write a new report on it."
    if stale:
        out["stale"] = (
            "No stored prices yet."
            if price is None
            else f"The last close Tearsheet has is from {_day(price[0].isoformat())}, so the "
            "price is out of date."
        )
    order = (
        "trigger",
        "outside",
        "near_trigger",
        "moved",
        "no_report",
        "slot_open",
        "left_index",
        "stale",
    )
    return [{"kind": k, "text": out[k]} for k in order if k in out], past


def _is_stale(last: date | None, now: datetime) -> bool:
    """As PriceStore.is_stale: no close, or one older than the session before the last
    completed one."""
    return last is None or last < previous_session(last_completed_session(now))


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    """The sidebar's numbers: companies watched, those with alerts not yet seen, and those with
    no report on show and no official prediction."""
    row = conn.execute(
        f"WITH watched AS ({_WATCHED})"
        " SELECT COUNT(*),"
        "  COALESCE(SUM(EXISTS (SELECT 1 FROM watch_events e"
        "   WHERE e.cik = w.cik AND e.seen_at IS NULL)), 0),"
        "  COALESCE(SUM(NOT EXISTS (SELECT 1 FROM reports r JOIN runs u ON u.run_id = r.run_id"
        "   WHERE u.cik = w.cik AND r.report_id NOT IN (SELECT report_id FROM hidden_reports))"
        "   AND NOT EXISTS (SELECT 1 FROM predictions p WHERE p.cik = w.cik)), 0)"
        " FROM watched w"
    ).fetchone()
    return {"watched": int(row[0]), "needs_look": int(row[1]), "no_report": int(row[2])}


def newest_close_date(conn: sqlite3.Connection) -> str | None:
    """The newest stored close: SPY's, which every top-up adds."""
    from tearsheet.data.prices import SPY_CIK

    return conn.execute(
        "SELECT MAX(date) FROM prices_daily WHERE cik = ? AND share_class = ''", (SPY_CIK,)
    ).fetchone()[0]


def page(
    conn: sqlite3.Connection,
    now: datetime,
    *,
    queued: dict[int, str] | None = None,
    prices_note: str | None = None,
) -> dict[str, Any]:
    """The whole watchlist page (protocol.WatchPage): the lists, and one row per watched company,
    oldest added first. `queued` is the report line's companies ("waiting" or "writing").
    Reads only."""
    from tearsheet.companies import display_name

    holdings = membership.load_bundled()
    splits = _splits(conn)
    stored = _stored_tickers(conn)
    queued = queued or {}
    rows = []
    for company in _companies(conn):
        cik, row, levels = company.cik, company.row, company.levels
        mine = splits.get(cik, {})
        recent = _recent(conn, cik)
        price = recent[0] if recent else None
        previous = None
        if len(recent) > 1 and recent[1][0] == previous_session(recent[0][0]):
            previous = round(
                recent[1][1] / split_factor_after(mine, recent[1][0], up_to=recent[0][0]), 6
            )
        at = _at(levels, mine, price[0]) if levels is not None and price is not None else None
        since = _move(company, mine, price[0], price[1]) if price is not None else None
        prediction = company.prediction
        official_from = _when(prediction["run_at"]) + WINDOW if prediction is not None else None
        slot_open = official_from is None or now >= official_from
        in_index = holdings.has(cik)
        stale = _is_stale(price[0] if price else None, now)
        reasons, past = _reasons(
            company,
            price=price,
            at=at,
            since=since,
            slot_open=slot_open,
            in_index=in_index,
            stale=stale,
        )
        ticker = _ticker(holdings, cik, stored, company.added_as)
        outside = None
        to_base = range_position = None
        if at is not None and price is not None:
            close = price[1]
            bear, base, bull = at["bear"], at["base"], at["bull"]
            if base is not None and close > 0:
                to_base = round(base / close - 1, 4)
            if bear is not None and bull is not None:
                if bull > bear:
                    range_position = round((close - bear) / (bull - bear), 4)
                outside = "below" if close < bear else "above" if close > bull else None
        rows.append(
            {
                "cik": cik,
                "ticker": ticker,
                "name": display_name(holdings, cik, row["stored_name"]) or ticker,
                "sector": (holdings.company(cik).sector or None) if in_index else None,
                "lists": company.lists,
                "added_at": company.added_at,
                "in_index": in_index,
                "price": price[1] if price else None,
                "price_date": price[0].isoformat() if price else None,
                "previous_close": previous,
                "stale": stale,
                "levels": _levels_out(levels, at) if levels is not None else None,
                "since_report": since,
                "to_base": to_base,
                "range_position": range_position,
                "outside": outside,
                "trigger_side": past,
                "official_from": official_from.astimezone(UTC).isoformat()
                if official_from is not None
                else None,
                "slot_open": slot_open,
                "report_age_days": (now - _when(company.made_at)).days
                if company.made_at is not None
                else None,
                "queued": queued.get(cik),
                "note": row["note"],
                "alerts": {
                    "range": bool(row["alert_range"]),
                    "trigger": bool(row["alert_trigger"]),
                    "move": company.move_alert,
                    "age": bool(row["alert_age"]),
                },
                "unseen": int(row["unseen"]),
                "reasons": reasons,
            }
        )
    return {
        "lists": lists(conn),
        "rows": rows,
        "counts": counts(conn),
        "as_of": newest_close_date(conn),
        "prices_note": prices_note,
    }


def _levels_out(levels: Levels, at: dict[str, float | None] | None) -> dict[str, Any]:
    """protocol.WatchLevels: in the last close's shares when there is a close."""
    scaled = at or {
        "report_price": levels.report_price,
        "bear": levels.bear,
        "base": levels.base,
        "bull": levels.bull,
        "buy_trigger": levels.buy,
        "sell_trigger": levels.sell,
    }
    return {
        "report_id": levels.report_id,
        "report_date": levels.report_date,
        "price_date": levels.price_date.isoformat(),
        "official": levels.official,
        "rating": levels.rating,
        "capped": levels.capped,
        "report_price": scaled["report_price"],
        "bear": scaled["bear"],
        "base": scaled["base"],
        "bull": scaled["bull"],
        "buy_trigger": scaled["buy_trigger"],
        "sell_trigger": scaled["sell_trigger"],
        "buy_reachable": levels.buy_reachable,
        "sell_reachable": levels.sell_reachable,
        "score_percentile": levels.score_percentile,
        "uncertainty": levels.uncertainty,
        "source": levels.source,
    }


def prices(conn: sqlite3.Connection, cik: int, since: str) -> dict[str, Any]:
    """A watched company's stored closes from `since`, in today's shares (protocol.WatchPrices),
    for one with no report to chart. Reads only."""
    from tearsheet.charts import _split_adjusted
    from tearsheet.data.prices import PriceStore

    _require_watched(conn, [cik])
    rows = conn.execute(
        "SELECT date, close_unadjusted, volume FROM prices_daily"
        " WHERE cik = ? AND share_class = '' ORDER BY date",
        (cik,),
    ).fetchall()
    close, _ = _split_adjusted(rows, PriceStore(conn).splits(cik))
    kept = [(r[0], c) for r, c in zip(rows, close, strict=True) if r[0] >= since]
    return {"dates": [d for d, _ in kept], "close": [c for _, c in kept]}


def events(
    conn: sqlite3.Connection,
    cik: int | None = None,
    limit: int = 50,
    *,
    ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    """Alerts that fired, newest first (protocol.WatchEvent): one company's (any it has ever
    had), the events with the given ids, or every watched company's. Reads only."""
    if ids is not None:
        marks = ", ".join("?" for _ in ids) or "NULL"
        found = conn.execute(
            f"SELECT * FROM watch_events WHERE event_id IN ({marks}) ORDER BY event_id DESC",
            ids,
        ).fetchall()
    elif cik is not None:
        if not conn.execute("SELECT 1 FROM watch_companies WHERE cik = ?", (cik,)).fetchone():
            raise ValueError(f"The company with CIK {cik} has never been watched.")
        found = conn.execute(
            "SELECT * FROM watch_events WHERE cik = ? ORDER BY event_id DESC LIMIT ?",
            (cik, limit),
        ).fetchall()
    else:
        found = conn.execute(
            f"SELECT * FROM watch_events WHERE cik IN ({_WATCHED}) ORDER BY event_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    holdings = membership.load_bundled()
    stored = _stored_tickers(conn)
    typed = {
        int(r[0]): r[1]
        for r in conn.execute("SELECT cik, added_as FROM watch_items ORDER BY added_at DESC")
    }
    return [
        {
            "event_id": e["event_id"],
            "cik": e["cik"],
            "ticker": _ticker(holdings, e["cik"], stored, typed.get(e["cik"], "")),
            "kind": e["kind"],
            "side": e["side"],
            "close_date": e["close_date"],
            "price": e["price"],
            "level": e["level"],
            "text": e["text"],
            "created_at": e["created_at"],
            "seen": e["seen_at"] is not None,
        }
        for e in found
    ]


def mark_notified(conn: sqlite3.Connection, ids: list[int], now: datetime) -> None:
    at = _iso(now)
    with conn:
        for event_id in ids:
            conn.execute(
                "UPDATE watch_events SET notified_at = ? WHERE event_id = ? AND notified_at IS NULL",
                (at, event_id),
            )


# --- alerts -------------------------------------------------------------------------------------


def _side(
    kind: str,
    company: _Company,
    splits: dict[date, float],
    day: date,
    close: float,
    before: str | None,
) -> tuple[str, float | None] | None:
    """Where a close stands for one alert, and the level it is measured against (in that close's
    shares). None when the alert can't apply (no range, no reachable trigger, no report close)."""
    levels = company.levels
    if levels is None:
        return None
    at = _at(levels, splits, day)
    if kind == "range":
        bear, bull = at["bear"], at["bull"]
        if bear is None or bull is None:
            return None
        if close < bear:
            return "below", bear
        if close > bull:
            return "above", bull
        return "inside", None
    if kind == "move":
        threshold = company.move_alert
        moved = _move(company, splits, day, close)
        if threshold is None or moved is None or company.then is None:
            return None
        then = round(company.then[1] / split_factor_after(splits, company.then[0], up_to=day), 6)
        if moved >= threshold:
            return "up", then
        if moved <= -threshold:
            return "down", then
        return "inside", then
    side = "buy" if kind == "trigger_buy" else "sell"
    level = at[side]
    if level is None:
        return None
    # On the trigger itself a close keeps the side it had; at first it counts as not past.
    if close == level:
        return (before or ("above" if side == "buy" else "below")), level
    return ("below" if close < level else "above"), level


def _alerts(company: _Company, kind: str, side: str) -> bool:
    """Whether moving to `side` alerts: leaving the range, moving past the line, or any
    change of side of a reachable trigger."""
    if kind == "range":
        return side in ("below", "above")
    if kind == "move":
        return side in ("up", "down")
    return True


def _enabled(company: _Company, kind: str) -> bool:
    row = company.row
    if kind == "range":
        return bool(row["alert_range"])
    if kind == "move":
        return row["alert_move"] is not None
    return bool(row["alert_trigger"])


def _event_text(
    kind: str, side: str, company: _Company, ticker: str, close: float, level: float | None
) -> str:
    levels = company.levels
    assert levels is not None
    made = f"the {_day(levels.report_date)} {levels.what}"
    if kind == "range":
        case = "bear" if side == "below" else "bull"
        return f"{ticker} closed at {_money(close)}, {side} the {case} case of {_money(level or 0)} in {made}."
    if kind == "move":
        assert level is not None
        return f"{ticker} closed at {_money(close)}, {side} {_pct(close / level - 1)} since {made}."
    trigger = "buy" if kind == "trigger_buy" else "sell"
    met = side == ("below" if trigger == "buy" else "above")
    return (
        f"{ticker} closed at {_money(close)}, {side} its {trigger} trigger of {_money(level or 0)}. "
        f"Holding the score and peers fixed, {_would(trigger, met, levels)}."
    )


def evaluate(
    conn: sqlite3.Connection, now: datetime, *, ciks: Iterable[int] | None = None
) -> list[int]:
    """Look at the closes stored since the last look, for every watched company (or those in
    `ciks`), and record each alert that fired. Returns the new events' ids.

    For each alert that is on and can apply: with no state yet, or state measured against
    another report (a new report, an erased or hidden one, the company just added), it starts
    from the newest close without alerting. Otherwise each close since (the latest MAX_WALK) is
    placed, and a change to an alerting side writes an event; moving back inside re-arms it.
    The 30-day window alert (`age`) fires once per prediction, when the window has passed and
    it opened after the company was added. Running it twice adds nothing."""
    holdings = membership.load_bundled()
    splits = _splits(conn)
    stored = _stored_tickers(conn)
    states: dict[int, dict[str, sqlite3.Row]] = {}
    for st in conn.execute("SELECT * FROM watch_alert_state"):
        states.setdefault(int(st["cik"]), {})[st["kind"]] = st
    at = _iso(now)
    writes: list[tuple[str, tuple]] = []
    found: list[tuple] = []
    for company in _companies(conn, ciks):
        cik, levels = company.cik, company.levels
        mine = splits.get(cik, {})
        state = states.get(cik, {})
        ticker = _ticker(holdings, cik, stored, company.added_as)
        newest = _recent(conn, cik, 1)
        for kind in PRICE_KINDS:
            st = state.get(kind)
            if levels is None or not newest or not _enabled(company, kind):
                if st is not None and (levels is None or not _enabled(company, kind)):
                    writes.append(
                        ("DELETE FROM watch_alert_state WHERE cik = ? AND kind = ?", (cik, kind))
                    )
                continue
            if st is None or st["report_id"] != levels.ref:
                day, close = newest[0]
                placed = _side(kind, company, mine, day, close, None)
                if placed is None:
                    if st is not None:
                        writes.append(
                            (
                                "DELETE FROM watch_alert_state WHERE cik = ? AND kind = ?",
                                (cik, kind),
                            )
                        )
                    continue
                writes.append(
                    (
                        "INSERT OR REPLACE INTO watch_alert_state"
                        " (cik, kind, report_id, side, close_date) VALUES (?, ?, ?, ?, ?)",
                        (cik, kind, levels.ref, placed[0], day.isoformat()),
                    )
                )
                continue
            side, last = st["side"], st["close_date"]
            walked = False
            for day, close in _closes_after(conn, cik, last):
                placed = _side(kind, company, mine, day, close, side)
                if placed is None:
                    break
                new, level = placed
                if new != side and _alerts(company, kind, new):
                    found.append(
                        (
                            cik,
                            kind,
                            levels.ref,
                            new,
                            day.isoformat(),
                            close,
                            level,
                            _event_text(kind, new, company, ticker, close, level),
                            at,
                        )
                    )
                side, last, walked = new, day.isoformat(), True
            if walked:
                writes.append(
                    (
                        "UPDATE watch_alert_state SET side = ?, close_date = ?"
                        " WHERE cik = ? AND kind = ?",
                        (side, last, cik, kind),
                    )
                )
        prediction = company.prediction
        if company.row["alert_age"] and prediction is not None:
            opened = _when(prediction["run_at"]) + WINDOW
            if now >= opened and opened > _when(company.added_at):
                found.append(
                    (
                        cik,
                        "age",
                        prediction["prediction_id"],
                        "open",
                        opened.astimezone(UTC).date().isoformat(),
                        None,
                        None,
                        f"A new report on {ticker} would now be an official prediction: its last "
                        f"one was made on {_day(prediction['run_at'])}.",
                        at,
                    )
                )
    if not writes and not found:
        return []
    inserted: list[int] = []
    with conn:
        for sql, args in writes:
            conn.execute(sql, args)
        for event in found:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO watch_events (cik, kind, ref, side, close_date, price,"
                " level, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                event,
            )
            if cursor.rowcount:
                inserted.append(int(cursor.lastrowid))
    return inserted


# --- prices for watched companies that left the index -------------------------------------------


def extra_price_tickers(
    conn: sqlite3.Connection, wanted: dict[str, tuple[int, str]]
) -> dict[str, tuple[int, str]]:
    """Watched companies outside `wanted` (the index's companies and SPY), in Massive's spelling,
    for the open app's whole-market top-up: their closes come in the summaries it already
    fetches, so they cost no call. Only those as current as the index's companies are added, so
    one that stopped trading (delisted) never makes the top-up reach further back."""
    from tearsheet.data.prices import PriceStore
    from tearsheet.resolve import ticker_for

    members = {key[0] for key in wanted.values()}
    others = [cik for cik in watched(conn) if cik not in members]
    if not others:
        return {}
    latest = PriceStore(conn).latest_dates()
    have = [latest[key] for key in wanted.values() if key in latest]
    if not have:
        return {}
    floor = min(have)
    holdings = membership.load_bundled()
    stored = _stored_tickers(conn)
    typed = {
        int(r[0]): r[1]
        for r in conn.execute("SELECT cik, added_as FROM watch_items ORDER BY added_at DESC")
    }
    out: dict[str, tuple[int, str]] = {}
    for cik in others:
        last = latest.get((cik, ""))
        ticker = _ticker(holdings, cik, stored, typed.get(cik, ""))
        if last is None or last < floor or not ticker:
            continue
        out[ticker_for("massive", ticker)] = (cik, "")
    return out
