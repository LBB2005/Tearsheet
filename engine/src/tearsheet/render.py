"""Filling in numbers and rendering the report (design items 31 and 32).

The AI writes numbers only as placeholders: {{metric:…}}, {{value:…}}, {{price:…}},
{{date:…}}, {{consensus:…}} and {{quote:…}}. A sentence with a placeholder not on its call's
list is removed ("unknown placeholder"). The numeric guard runs before placeholders are
filled. The HTML is the only report renderer; all AI and source text goes in as escaped plain
text, and the page carries its own content-security policy.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from jinja2 import Environment, PackageLoader, select_autoescape

PLACEHOLDER = re.compile(r"\{\{([a-z_]+:[A-Za-z0-9_.\-]+)\}\}")
CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"


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
    numbers: dict[str, Any] | None = None,
) -> str:
    """`mode` is "app" (with flag and re-read links) or "file" (terminal mode: claim IDs shown,
    no tearsheet: links). `view` is the text view shown first ("summary" or "full"); `column` is
    "both", or "numbers" or "text" alone for beside the chart. A file is read without the app, so
    it always shows both columns, stacked, with the Full view open."""
    if mode not in ("app", "file"):
        raise ValueError(mode)
    if view not in ("summary", "full"):
        raise ValueError(view)
    if column not in ("both", "numbers", "text"):
        raise ValueError(column)
    if mode == "file":
        view, column = "full", "both"
    given = numbers or {}
    return _ENV.get_template("report.html.j2").render(
        r=report,
        n={key: given.get(key) for key in NUMBER_KEYS},
        mode=mode,
        view=view,
        column=column,
        csp=CSP,
        safe_url=_safe_url,
        anchor=lambda frag: _anchor(mode, frag),
        fmt=format_value,
        metric_text=_metric_text,
        source_label=_source_labels(report),
        red_flag_labels=RED_FLAG_LABELS,
    )
