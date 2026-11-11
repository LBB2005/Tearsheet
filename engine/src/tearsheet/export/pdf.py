"""The PDF download's page: the saved report as a bank-style company note in Look 2 (Liam's pick
on 8 Nov 2026), US Letter. The engine writes the HTML; the app prints it to PDF with Electron's
printToPDF, which adds the footer with page numbers (Electron 33 can't draw CSS page margin
boxes).

Page 1 is the summary: the call, a code-written headline, the key points (each section's first
checked claim) with their note numbers, three exhibits and a sidebar of key data. Then the full
report, the numbers, how it was checked, the numbered sources and the important information.
Every word is the report's own or written here from its saved numbers. The analyst panel, when
analystdb answers, shows the street's ratings and targets, never S&P Global's trust-check
figures.
"""

from __future__ import annotations

import html
import math
import re
from datetime import date
from typing import Any

from jinja2 import Environment, PackageLoader, select_autoescape

from tearsheet.export import style
from tearsheet.export.data import LABEL, METHOD_LABELS, ExportData, day_text
from tearsheet.wording import PRICES_LINE

_ENV = Environment(
    loader=PackageLoader("tearsheet", "templates"),
    autoescape=select_autoescape(default=True, default_for_string=True),
)
CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"


def money(v: float | None) -> str:
    return "n/a" if v is None else f"${v:,.2f}"


def ordinal(k: int) -> str:
    return (
        f"{k}{'th' if k % 100 in (11, 12, 13) else {1: 'st', 2: 'nd', 3: 'rd'}.get(k % 10, 'th')}"
    )


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _upside(d: ExportData) -> float | None:
    base = _num((d.numbers.get("range") or {}).get("base"))
    price = _num((d.numbers.get("price") or {}).get("value"))
    return base / price - 1 if base is not None and price else None


def _horizon(d: ExportData) -> str | None:
    if d.price_day is None:
        return None
    return date(d.price_day.year + 1, d.price_day.month, 1).strftime("%b %Y")


def headline(d: ExportData) -> str:
    """The verdict with its numbers, written by code."""
    n = d.numbers
    rating = (n.get("rating") or {}).get("call")
    if not rating:
        return "No rating is stored for this report."
    base = _num((n.get("range") or {}).get("base"))
    up = _upside(d)
    text = str(rating)
    if base is not None and up is not None and _horizon(d):
        side = "above" if up >= 0 else "below"
        text += f": base case {money(base)} by {_horizon(d)}, {abs(up):.1%} {side} today's price"
    unc = (n.get("rating") or {}).get("uncertainty")
    return text + (f", with {unc} uncertainty" if unc else "")


def call_line(d: ExportData) -> str:
    """The Summary view's call line, as the app writes it."""
    n = d.numbers
    parts = []
    score = (n.get("score") or {}).get("percentile")
    if score is not None:
        group = f" {d.peer_count}-company" if d.peer_count else ""
        parts.append(
            f"{d.ticker} scores in the {ordinal(int(score))} percentile of its{group} peer group."
        )
    price = _num((n.get("price") or {}).get("value"))
    value = _num((n.get("estimate") or {}).get("value"))
    rng = n.get("range") or {}
    if price is not None:
        line = f"The price is {money(price)}"
        if value is not None:
            line += f" against an estimated value of {money(value)}"
        if _num(rng.get("bear")) is not None and _num(rng.get("bull")) is not None:
            line += (
                f", and the 12-month range runs from {money(rng['bear'])} to {money(rng['bull'])}"
            )
        parts.append(line + ".")
    if (n.get("rating") or {}).get("capped"):
        parts.append("The rating is capped at Hold by a red flag.")
    return " ".join(parts)


# --- SVG charts (numbers only; labels escaped) ----------------------------------------------------


def price_svg(d: ExportData, w: int = 466, h: int = 96) -> str | None:
    weekly = d.numbers.get("weekly") or []
    closes = [_num(p.get("close")) for p in weekly]
    closes = [c for c in closes if c is not None]
    if len(closes) < 2:
        return None
    lo, hi = min(closes), max(closes)
    raw = (hi - lo) / 3 or 1
    power = 10 ** math.floor(math.log10(raw))
    step = next(m * power for m in (1, 2, 2.5, 5, 10) if m * power >= raw)
    bottom, top = math.floor(lo / step) * step, math.ceil(hi / step) * step
    if top == bottom:
        top += step
    plot_w, plot_h = w - 40, h - 16
    xs = [i / (len(closes) - 1) * plot_w for i in range(len(closes))]
    ys = [plot_h - (c - bottom) / (top - bottom) * (plot_h - 4) for c in closes]
    path = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in zip(xs, ys, strict=True))
    out = [
        f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Share price, past 12 months">'
    ]
    v = bottom
    while v <= top + 1e-9:
        y = plot_h - (v - bottom) / (top - bottom) * (plot_h - 4)
        out.append(f'<line x1="0" x2="{plot_w}" y1="{y:.1f}" y2="{y:.1f}" class="grid"/>')
        out.append(f'<text x="{plot_w + 4}" y="{y + 3:.1f}" class="ax">${v:,.0f}</text>')
        v += step
    out.append(f'<path d="{path}" class="line"/>')
    first = date.fromisoformat(str(weekly[0]["date"]))
    last = date.fromisoformat(str(weekly[-1]["date"]))
    out.append(f'<text x="0" y="{h - 2}" class="ax">{first:%b %Y}</text>')
    out.append(f'<text x="{plot_w}" y="{h - 2}" class="ax" text-anchor="end">{last:%b %Y}</text>')
    out.append("</svg>")
    return "".join(out)


def range_svg(d: ExportData, w: int = 186) -> str | None:
    n = d.numbers
    rng, price = n.get("range") or {}, _num((n.get("price") or {}).get("value"))
    vals = [_num(rng.get(k)) for k in ("bear", "base", "bull")]
    if any(v is None for v in vals):
        return None
    bear, base, bull = vals
    lo, hi = bear * 0.92, bull * 1.04
    if price is not None:
        lo, hi = min(lo, price * 0.95), max(hi, price * 1.05)

    def x(v: float) -> float:
        return (v - lo) / (hi - lo) * w

    by, bh = 15, 6
    out = [
        f'<svg width="{w}" height="38" viewBox="0 0 {w} 38" role="img" aria-label="12-month range">'
    ]
    out.append(
        f'<rect x="{x(bear):.1f}" y="{by}" width="{x(bull) - x(bear):.1f}" height="{bh}" rx="3" class="band"/>'
    )
    for v, cls in ((bear, "bear"), (base, "base"), (bull, "bull")):
        out.append(f'<circle cx="{x(v):.1f}" cy="{by + bh / 2}" r="3.8" class="{cls}"/>')
    for v, cls, at, anchor in (
        (bear, "bear", 0, "start"),
        (base, "base", w / 2, "middle"),
        (bull, "bull", w, "end"),
    ):
        out.append(
            f'<text x="{at:.1f}" y="{by + bh + 12}" class="rl {cls}" text-anchor="{anchor}">{cls.capitalize()} {money(v)}</text>'
        )
    if price is not None:
        px = x(price)
        out.append(
            f'<line x1="{px:.1f}" x2="{px:.1f}" y1="{by - 5}" y2="{by + bh + 2}" class="px"/>'
        )
        out.append(
            f'<text x="{min(max(px, 30), w - 30):.1f}" y="{by - 7}" class="rl" text-anchor="middle">Price {money(price)}</text>'
        )
    out.append("</svg>")
    return "".join(out)


# --- the page -----------------------------------------------------------------------------------


def _analysts(panel: dict | None) -> dict | None:
    """analystdb's figures for the PDF: ratings and targets only (never the S&P Global check)."""
    # analystdb is Liam's own local service: where it doesn't answer, there is no panel at all
    # (launch-readiness S3). Only "has none for this company" gets the quiet line.
    if not panel or panel.get("state") == "down":
        return None
    if panel.get("state") != "ok":
        return {"state": "quiet", "note": str(panel.get("note") or "analystdb didn't answer.")}
    sides = panel.get("sides") or {}
    target = panel.get("target") or {}
    return {
        "state": "ok",
        "asof": str(panel.get("asof_text") or ""),
        "firms": panel.get("n_firms"),
        "sides": [(k.capitalize(), int(sides.get(k) or 0)) for k in ("buy", "hold", "sell")],
        "targets": [
            (label, money(_num(target.get(key))) if _num(target.get(key)) is not None else "n/a")
            for key, label in (
                ("mean", "Average target"),
                ("median", "Median target"),
                ("high", "High"),
                ("low", "Low"),
            )
        ],
        "n_targets": target.get("n"),
    }


_NUMBERISH = re.compile(r"^[-+(]?\$?[\d,.]+[%x)]?$|^not meaningful$|^n/a$")


def _numeric_columns(rows: list[list[str]]) -> list[bool]:
    """Which columns hold numbers, to right-align them: most of the body's cells look numeric."""
    body = rows[1:]
    out = []
    for col in range(len(rows[0])):
        cells = [str(r[col]).strip() for r in body if col < len(r) and str(r[col]).strip()]
        out.append(
            col > 0
            and bool(cells)
            and sum(bool(_NUMBERISH.match(c)) for c in cells) * 2 > len(cells)
        )
    return out


def footer_text(d: ExportData) -> str:
    return f"Tearsheet Research · {d.name} ({d.ticker}) · company note, {day_text(d.made_on)} · {LABEL}"


def render(d: ExportData, analysts: dict | None = None) -> str:
    """The print page's HTML."""
    from tearsheet.data.analyst import NOT_AVAILABLE_SHOWN, shown_line
    from tearsheet.render import RED_FLAG_LABELS

    a = _analysts(analysts)
    hide = NOT_AVAILABLE_SHOWN if a and a["state"] == "ok" else None
    n, v = d.numbers, d.views
    weekly = [_num(p.get("close")) for p in n.get("weekly") or []]
    weekly = [c for c in weekly if c is not None]
    # Page 1 uses exhibits 1-3, and 4 for the Key numbers when they can be read.
    exhibit = {"n": 4 if d.key_numbers else 3}

    def next_exhibit() -> int:
        exhibit["n"] += 1
        return exhibit["n"]

    sections = []
    for s in d.sections:
        table = None
        if s.table:
            rows = [list(r) for r in s.table]
            for row in rows[1:]:
                if row and s.key == "valuation":
                    row[0] = METHOD_LABELS.get(row[0], row[0])
                elif row and row[0][:1].islower():
                    row[0] = row[0][:1].upper() + row[0][1:]
            table = {"n": next_exhibit(), "rows": rows, "right": _numeric_columns(rows)}
        sections.append(
            {
                "title": f"{s.number}. {s.title}" if s.number else s.title,
                "lines": [p for p in map(shown_line, s.paragraphs) if p != hide],
                "table": table,
                "claims": s.claims,
            }
        )
    metrics = []
    from tearsheet.render import METRIC_KINDS, format_value

    for m in v.get("metrics") or []:
        kind = "ratio" if METRIC_KINDS.get(m.get("name")) == "ratio" else "percent"
        metrics.append(
            (
                m.get("label"),
                format_value(kind, m.get("value")),
                format_value(kind, m.get("peer_median")),
                m.get("percentile") if m.get("percentile") is not None else "n/a",
            )
        )
    one_year = next((r for r in v.get("returns") or [] if r.get("years") == 1), None)
    used = sorted({x for s in d.sections for c in s.claims for x in c.notes})
    return _ENV.get_template("print.html.j2").render(
        d=d,
        n=n,
        v=v,
        csp=CSP,
        label=LABEL,
        prices_line=PRICES_LINE,
        disclaimer=style.DISCLAIMER,
        brand=style.BRAND,
        mark=_mark_data_uri(),
        headline=headline(d),
        call_line=call_line(d),
        horizon=_horizon(d),
        upside=_upside(d),
        money=money,
        ordinal=ordinal,
        day_text=day_text,
        iso_day=lambda iso: day_text(date.fromisoformat(iso)),
        price_svg=price_svg(d),
        range_svg=range_svg(d),
        low52=min(weekly) if weekly else None,
        high52=max(weekly) if weekly else None,
        one_year=one_year,
        keys=d.key_numbers,
        sections=sections,
        metrics=metrics,
        analysts=a,
        red_flag_labels=RED_FLAG_LABELS,
        notes=[note for note in d.notes if note.number in set(used)] or d.notes,
        sector=d.sector or "n/a",
        esc=html.escape,
    )


def _mark_data_uri() -> str:
    import base64

    return "data:image/png;base64," + base64.b64encode(style.mark_png()).decode()
