"""Filling in numbers and rendering the report (design items 31 and 32).

The AI writes numbers only as placeholders: {{metric:…}}, {{value:…}}, {{price:…}},
{{date:…}}, {{consensus:…}} and {{quote:…}}. A sentence with a placeholder not on its call's
list is removed ("unknown placeholder"). The numeric guard runs before placeholders are
filled. The HTML is the only report renderer; all AI and source text goes in as escaped plain
text, and the page carries its own content-security policy.
"""

from __future__ import annotations

import re
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


def _safe_url(url: str | None) -> str | None:
    return url if url and url.startswith("https://") else None


def render_html(
    report: dict[str, Any],
    *,
    mode: str,
    view: str = "summary",
    column: str = "both",
    numbers: dict[str, Any] | None = None,
) -> str:
    """`mode` is "app" (with flag and re-read links) or "file" (terminal mode: claim IDs shown,
    no tearsheet: links)."""
    if mode not in ("app", "file"):
        raise ValueError(mode)
    if view not in ("summary", "full"):
        raise ValueError(view)
    if column not in ("both", "numbers", "text"):
        raise ValueError(column)
    return _ENV.get_template("report.html.j2").render(
        r=report,
        mode=mode,
        view=view,
        column=column,
        numbers=numbers,
        csp=CSP,
        safe_url=_safe_url,
    )
