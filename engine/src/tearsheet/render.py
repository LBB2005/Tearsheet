"""Filling in numbers and rendering the report (design items 31 and 32).

The AI writes numbers only as placeholders: {{metric:…}}, {{value:…}}, {{price:…}},
{{date:…}}, {{consensus:…}} and {{quote:…}}. A sentence with a placeholder not on its call's
list is removed ("unknown placeholder"). The numeric guard runs before placeholders are
filled. The HTML is the only report renderer; all AI and source text goes in as escaped plain
text, and the page carries its own content-security policy.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from jinja2 import Environment, PackageLoader, select_autoescape

from tearsheet.wording import ADVICE_LINE, ADVICE_SHORT

PLACEHOLDER = re.compile(r"\{\{([a-z_]+:[A-Za-z0-9_.\-]+)\}\}")
CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
# The app's layout that follows the frame (column "auto"): both columns from this frame width,
# and below it the one column `side` names. The app reads the same number (report/view.ts).
TWO_COLUMNS_MIN = 860
# The key tiles show in one column only when the frame is (nearly) the whole page: a window from
# its 820 px minimum up to TWO_COLUMNS_MIN with the chart closed. Beside an open chart the frame
# is about 340-730 px, and the Key numbers already sit under the chart there.
KEY_TILES_MIN = 800


@dataclass(frozen=True)
class PlaceholderValue:
    key: str  # "metric:operating_margin"
    kind: str  # percent, ratio, price, amount, count, date, text
    value: Any


def format_value(kind: str, value: Any) -> str:
    if value is None:
        return "not available"
    if kind == "percent":
        return f"{value * 100:.1f}%"
    if kind == "ratio":
        return f"{value:.1f}×"
    if kind == "price":
        return f"${value:,.2f}"
    if kind == "amount":
        sign = "-" if value < 0 else ""
        size = abs(value)
        if size >= 1e9:
            return f"{sign}${size / 1e9:,.1f} billion"
        if size >= 1e6:
            return f"{sign}${size / 1e6:,.1f} million"
        return f"{sign}${size:,.0f}"
    if kind == "count":
        return f"{round(value):,}"
    if kind == "date":
        day = value if isinstance(value, date) else date.fromisoformat(str(value))
        return f"{day.day} {day:%b %Y}"
    return str(value)


def fill(text: str, allowed: dict[str, PlaceholderValue]) -> tuple[str | None, str | None]:
    keys = PLACEHOLDER.findall(text)
    if any(k not in allowed for k in keys):
        return None, "unknown placeholder"
    return PLACEHOLDER.sub(
        lambda m: format_value(allowed[m.group(1)].kind, allowed[m.group(1)].value), text
    ), None


_ENV = Environment(
    loader=PackageLoader("tearsheet", "templates"),
    autoescape=select_autoescape(default=True, default_for_string=True),
)
# The report's "not advice" line (wording.py). The short form sits under the rating; the long form
# opens a report file and closes the report in the app (docs/launch/launch-readiness.md, M5).
_ENV.globals.update(ADVICE_SHORT=ADVICE_SHORT, ADVICE_LINE=ADVICE_LINE)

# The keys of report_numbers.numbers_for. A key that is missing, or numbers that are None, renders
# as "not stored for this report".
NUMBER_KEYS = (
    "rating",
    "score",
    "range",
    "price",
    "estimate",
    "triggers",
    "factors",
    "methods",
    "returns_12m",
    "peer_ratings",
    "economy",
    "metrics",
    "weekly",
    "claims",
    "red_flags",
)
# How each key metric is written; the rest are percentages.
METRIC_KINDS = {"interest_coverage": "ratio", "operating_cash_flow_to_net_income": "ratio"}
# The four red-flag checks (flags.py), in the order the meter shows them.
RED_FLAG_LABELS = {
    "restatement": "Restatement",
    "material_weakness": "Material weakness",
    "going_concern": "Going concern",
    "risk_factor_change": "Risk-factor change",
}


def _safe_url(url: str | None) -> str | None:
    return url if url and url.startswith("https://") else None


def _anchor(mode: str, frag: str) -> str:
    """A link to a part of the same page. Inside the app's srcdoc frame a bare "#frag" resolves
    against the app's own address, so app mode names the srcdoc document."""
    return f"about:srcdoc#{frag}" if mode == "app" else f"#{frag}"


# The views the app can open bigger. app/src/main/views.test.ts checks this against VIEWS in
# navigation.ts, so the two lists can't drift apart.
OPEN_VIEWS = (
    "price",
    "factors",
    "metrics",
    "methods",
    "returns",
    "flags",
    "economy",
    "rings",
    "analysts",
)
_TABLE_VIEW = re.compile(r"table-[a-z_]{1,32}")
# A saved report's id, as the download links carry it (app main/navigation.ts checks the same).
_REPORT_ID = re.compile(r"[A-Za-z0-9._-]{1,80}")
_OPEN_ITEM = re.compile(r"[A-Za-z0-9_.\-]{1,64}")


def open_link(view: str, item: object = None) -> str | None:
    """A tearsheet://open link that asks the app to show a chart or table bigger. A view the app
    doesn't know gives None, so a template slip shows up as a missing link rather than a dead
    one. An item that doesn't look like a stored code is dropped, and the view still opens."""
    try:
        if view not in OPEN_VIEWS and not _TABLE_VIEW.fullmatch(view):
            return None
        link = f"tearsheet://open/{view}"
        if item is not None and _OPEN_ITEM.fullmatch(str(item)):
            link += f"/{item}"
        return link
    except Exception:
        return None


def _ring_arc(centre: float, radius: float, start: float, end: float) -> str:
    """The path of one slice of a ring, from `start` to `end` as fractions of the way round,
    clockwise from where a circle's stroke starts (the donut macro turns the ring so that is
    the top). Jinja has no trigonometry, so the points are worked out here. An arc can't end
    where it starts, so a slice that goes the whole way round is drawn as two halves, closed."""

    def point(at: float) -> str:
        angle = math.tau * at
        return f"{centre + radius * math.cos(angle):.2f} {centre + radius * math.sin(angle):.2f}"

    r = f"{radius:g} {radius:g}"
    if end - start >= 1:
        return f"M {point(start)} A {r} 0 0 1 {point(start + 0.5)} A {r} 0 0 1 {point(start)} Z"
    large = 1 if end - start > 0.5 else 0
    return f"M {point(start)} A {r} 0 {large} 1 {point(end)}"


def _metric_text(name: str, value: float | None) -> str:
    return format_value(METRIC_KINDS.get(name, "percent"), value)


def _source_labels(report: dict[str, Any]) -> Callable[[dict[str, Any]], str | None]:
    """A short name for each cited source: the filing's form and item ("10-K, Item 1A"), or the
    article's publisher and date. None when neither is known."""
    forms = {
        f.get("accession"): f.get("form")
        for f in report.get("filings") or []
        if isinstance(f, dict) and f.get("form")
    }
    articles = {
        link.get("url"): ", ".join(
            str(x) for x in (link.get("publisher"), link.get("published")) if x
        )
        for section in report.get("sections") or []
        if isinstance(section, dict)
        for link in section.get("links") or []
        if isinstance(link, dict) and link.get("url") and link.get("publisher")
    }

    def label(citation: dict[str, Any]) -> str | None:
        accession, _, rest = str(citation.get("id") or "").partition("#")
        if accession in forms:
            item = re.sub(r"^Part [IV]+ ", "", rest.split("#", 1)[0].replace("_", " ")).strip()
            return f"{forms[accession]}, {item}" if item else forms[accession]
        return articles.get(citation.get("url")) or None

    return label


def render_html(
    report: dict[str, Any],
    *,
    mode: str,
    view: str = "summary",
    column: str = "both",
    narrow: bool = False,
    side: str = "text",
    motion: bool = True,
    numbers: dict[str, Any] | None = None,
    analysts: dict[str, Any] | None = None,
    report_id: str | None = None,
) -> str:
    """`mode` is "app" (with flag and re-read links) or "file" (terminal mode: claim IDs shown,
    no tearsheet: links). `view` is the text view shown first ("summary" or "full"); `column` is
    "both", or "numbers" or "text" alone for beside the chart, or "auto": both columns, laid out
    by the frame's own width, so the app can open, close and resize the chart without loading
    the report again. From TWO_COLUMNS_MIN px both show; below it, the one `side` names.
    With "auto" the row of five key-number tiles is always in the page, above the text, and the
    page's own CSS shows it only in one column that is (nearly) the whole page, from
    KEY_TILES_MIN to TWO_COLUMNS_MIN, so the window crossing 1,100 px never needs the report
    loaded again. `narrow` adds the tiles to the text column
    alone ("text"); it no longer changes "auto". `motion` False leaves out the entrance motion, for a frame loaded
    after the report was already on show. A file is read without the app, so it always shows
    both columns, stacked, with the Full view open.

    `analysts` is analystdb's panel (data/analystdb.py), asked for as the report opened: its
    figures, or the quiet line when analystdb couldn't answer. None leaves it out, and the page
    is then exactly as before. While the figures show, section 1's stored line saying the
    consensus is not available is left off the page; the stored report keeps it. A file never
    shows the panel."""
    if mode not in ("app", "file"):
        raise ValueError(mode)
    if view not in ("summary", "full"):
        raise ValueError(view)
    if column not in ("both", "numbers", "text", "auto"):
        raise ValueError(column)
    if side not in ("text", "numbers"):
        raise ValueError(side)
    # readouts.py imports format_value from this module, so it is imported here, when a page is
    # drawn, rather than at the top, where the two modules would import each other in a loop.
    from tearsheet import readouts
    from tearsheet.data.analyst import NOT_AVAILABLE

    if mode == "file":
        view, column, side = "full", "both", "text"
    given = numbers or {}
    if mode != "app":
        analysts = None
    shows_analysts = bool(analysts) and analysts.get("state") == "ok"
    key_tiles = column == "auto" or (bool(narrow) and column == "text")
    return _ENV.get_template("report.html.j2").render(
        r=readouts.shown_tables(report),
        n={key: given.get(key) for key in NUMBER_KEYS},
        analysts=analysts or None,
        hide_line=NOT_AVAILABLE if shows_analysts else None,
        mode=mode,
        view=view,
        column=column,
        side=side,
        motion=motion,
        two_min=TWO_COLUMNS_MIN,
        keys_min=KEY_TILES_MIN,
        key_tiles=key_tiles,
        csp=CSP,
        safe_url=_safe_url,
        anchor=lambda frag: _anchor(mode, frag),
        fmt=format_value,
        metric_text=_metric_text,
        source_label=_source_labels(report),
        red_flag_labels=RED_FLAG_LABELS,
        ro=readouts,
        open_link=open_link,
        arc=_ring_arc,
        report_id=report_id if mode == "app" and _REPORT_ID.fullmatch(report_id or "") else None,
    )
