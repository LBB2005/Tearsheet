"""The slide deck download: 12 main slides and an appendix, like a CFA Research Challenge deck
(Liam's pick on 8 Nov 2026), in Look 2 on white 16:9 slides.

Every word on a slide is either the report's own claim, copied whole, or a line written here
from the saved numbers. Claims are never cut or reworded: a slide takes as many whole claims as
fit and says how many more are in the PDF. The deck uses Arial, which every Mac and PC has,
since a .pptx doesn't carry its fonts.
"""

from __future__ import annotations

import io
import math
from datetime import date
from typing import Any

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.util import Inches, Pt

from tearsheet.export import style
from tearsheet.export.data import LABEL, Claim, ExportData, day_text
from tearsheet.wording import PRICES_LINE

FONT = "Arial"
W, H = 13.333, 7.5
LEFT, RIGHT = 0.6, 13.333 - 0.6
TOP_BODY, BOTTOM_BODY = 2.25, 6.75
# "No Style, No Grid": tables get only the fills set here, not the theme's blue banding.
PLAIN_TABLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"


def _rgb(hex_color: str) -> RGBColor:
    return RGBColor.from_string(hex_color.lstrip("#"))


def money(v: float) -> str:
    return f"${v:,.2f}"


def pct(v: float, signed: bool = False) -> str:
    return f"{v:+.1%}" if signed else f"{v:.1%}"


def ordinal(k: int) -> str:
    return (
        f"{k}{'th' if k % 100 in (11, 12, 13) else {1: 'st', 2: 'nd', 3: 'rd'}.get(k % 10, 'th')}"
    )


def _nice_step(raw: float) -> float:
    """A round axis step (1, 2, 2.5 or 5 times a power of ten) at least `raw`."""
    power = 10 ** math.floor(math.log10(raw))
    return next(m * power for m in (1, 2, 2.5, 5, 10) if m * power >= raw)


# Short names for a sentence: "the median of residual income and P/E vs peers".
SHORT_METHOD = {
    "DCF": "DCF",
    "RESIDUAL_INCOME": "residual income",
    "MULTIPLES": "peer multiples",
    "PE": "P/E vs peers",
    "FFO": "price/FFO vs REITs",
    "P_FFO": "price/FFO vs REITs",
}


def lines_needed(text: str, width_in: float, size_pt: float) -> int:
    """About how many lines Arial at `size_pt` needs for `text` in a box `width_in` wide."""
    per_line = max(1, int(width_in * 72 / (size_pt * 0.48)))
    return max(1, math.ceil(len(text) / per_line))


class _Deck:
    def __init__(self, data: ExportData) -> None:
        self.d = data
        self.prs = Presentation()
        self.prs.slide_width = Inches(W)
        self.prs.slide_height = Inches(H)
        self.blank = self.prs.slide_layouts[6]
        self.page = 0
        self.used_notes: list[int] = []
        props = self.prs.core_properties
        props.title = f"{data.name} ({data.ticker}): Tearsheet report"
        props.author = "Tearsheet Research"
        props.comments = LABEL
        props.subject = f"Company note, {day_text(data.made_on)}"

    # --- drawing helpers ---------------------------------------------------------------------

    def text(
        self,
        slide,
        x: float,
        y: float,
        w: float,
        h: float,
        runs: list[tuple[str, dict[str, Any]]] | str,
        *,
        size: float = 14,
        color: str = style.INK,
        bold: bool = False,
        italic: bool = False,
        align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP,
        spacing: int | None = None,
    ):
        box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = box.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.vertical_anchor = anchor
        for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
            setattr(tf, side, 0)
        p = tf.paragraphs[0]
        p.alignment = align
        items = [(runs, {})] if isinstance(runs, str) else runs
        for text, opts in items:
            self._run(
                p,
                text,
                size=opts.get("size", size),
                color=opts.get("color", color),
                bold=opts.get("bold", bold),
                italic=opts.get("italic", italic),
                sup=opts.get("sup", False),
                spacing=opts.get("spacing", spacing),
            )
        return box

    def _run(self, p, text: str, *, size, color, bold=False, italic=False, sup=False, spacing=None):
        r = p.add_run()
        r.text = text
        f = r.font
        f.name = FONT
        f.size = Pt(size)
        f.bold = bold
        f.italic = italic
        f.color.rgb = _rgb(color)
        if sup:
            r.font._rPr.set("baseline", "30000")
        if spacing:
            r.font._rPr.set("spc", str(spacing))
        return r

    def rect(
        self,
        slide,
        x,
        y,
        w,
        h,
        fill: str | None,
        line: str | None = None,
        line_w: float = 1.0,
        shape=MSO_SHAPE.RECTANGLE,
    ):
        s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
        if fill:
            s.fill.solid()
            s.fill.fore_color.rgb = _rgb(fill)
        else:
            s.fill.background()
        if line:
            s.line.color.rgb = _rgb(line)
            s.line.width = Pt(line_w)
        else:
            s.line.fill.background()
        s.shadow.inherit = False
        return s

    def line(self, slide, x1, y1, x2, y2, color: str, width: float = 1.0, dash: bool = False):
        c = slide.shapes.add_connector(
            MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2)
        )
        c.line.color.rgb = _rgb(color)
        c.line.width = Pt(width)
        if dash:
            from pptx.enum.dml import MSO_LINE_DASH_STYLE

            c.line.dash_style = MSO_LINE_DASH_STYLE.DASH
        return c

    def signature_rule(self, slide, x, y, w, h=0.07):
        s = self.rect(slide, x, y, w, h, style.SIGNATURE_FROM)
        s.fill.gradient()
        s.fill.gradient_angle = 0
        stops = s.fill.gradient_stops
        stops[0].color.rgb = _rgb(style.SIGNATURE_FROM)
        stops[1].color.rgb = _rgb(style.SIGNATURE_TO)
        return s

    def table(
        self,
        slide,
        x,
        y,
        w,
        rows: list[list[str]],
        widths: list[float],
        *,
        size=11,
        right: tuple[int, ...] = (),
        row_h=0.3,
        bold_last=False,
    ):
        shape = slide.shapes.add_table(
            len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(row_h * len(rows))
        )
        tbl = shape.table
        tbl._tbl.tblPr.find(
            "{http://schemas.openxmlformats.org/drawingml/2006/main}tableStyleId"
        ).text = PLAIN_TABLE
        for i, width in enumerate(widths):
            tbl.columns[i].width = Inches(width)
        for r, row in enumerate(rows):
            tbl.rows[r].height = Inches(row_h)
            for c, value in enumerate(row):
                cell = tbl.cell(r, c)
                cell.margin_left = cell.margin_right = Inches(0.08)
                cell.margin_top = cell.margin_bottom = Inches(0.03)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.fill.solid()
                if r == 0:
                    cell.fill.fore_color.rgb = _rgb(style.NAVY)
                else:
                    cell.fill.fore_color.rgb = _rgb(style.FILL if r % 2 == 0 else "#FFFFFF")
                tf = cell.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.alignment = PP_ALIGN.RIGHT if c in right else PP_ALIGN.LEFT
                self._run(
                    p,
                    str(value),
                    size=size,
                    color="#FFFFFF" if r == 0 else style.INK,
                    bold=r == 0 or (bold_last and r == len(rows) - 1),
                )
        return tbl

    # --- the frame every slide shares --------------------------------------------------------

    def slide(self, kicker: str, title: str, source: str):
        s = self.prs.slides.add_slide(self.blank)
        self.page += 1
        d = self.d
        s.shapes.add_picture(
            io.BytesIO(style.mark_png()), Inches(LEFT - 0.04), Inches(0.3), height=Inches(0.36)
        )
        self.text(
            s,
            LEFT + 0.38,
            0.38,
            5,
            0.25,
            style.BRAND,
            size=10,
            bold=True,
            color=style.NAVY,
            spacing=300,
        )
        self.text(
            s,
            7.5,
            0.38,
            RIGHT - 7.5,
            0.25,
            f"{d.name} ({d.ticker}) · Company note · {day_text(d.made_on)}",
            size=10,
            color=style.GREY,
            align=PP_ALIGN.RIGHT,
        )
        self.line(s, LEFT, 0.76, RIGHT, 0.76, style.NAVY, 1.0)
        if kicker:
            self.text(
                s,
                LEFT,
                0.95,
                8,
                0.25,
                kicker.upper(),
                size=10,
                bold=True,
                color=style.GREY,
                spacing=150,
            )
        if title:
            size = 24 if lines_needed(title, RIGHT - LEFT, 24) <= 2 else 20
            self.text(
                s, LEFT, 1.22, RIGHT - LEFT, 0.95, title, size=size, bold=True, color=style.NAVY
            )
        self.line(s, LEFT, 6.95, RIGHT, 6.95, style.RULE, 0.5)
        self.text(
            s,
            LEFT,
            7.02,
            10.4,
            0.36,
            [(source + " ", {"italic": True}), (LABEL + " " + PRICES_LINE, {})],
            size=8,
            color=style.GREY,
        )
        self.text(
            s,
            RIGHT - 2.2,
            7.02,
            2.2,
            0.2,
            f"Tearsheet Research · {self.page}",
            size=8,
            color=style.GREY,
            align=PP_ALIGN.RIGHT,
        )
        return s

    def claims(
        self, s, claims: list[Claim], x, y, w, h, *, size=14, label: str | None = None
    ) -> int:
        """Whole claims, as many as fit, each with its note numbers. Returns how many fit."""
        box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = box.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
            setattr(tf, side, 0)
        used = 0.0
        if label:
            p = tf.paragraphs[0]
            self._run(p, label.upper(), size=11, color=style.NAVY, bold=True, spacing=100)
            p.space_after = Pt(4)
            used += (11 * 1.2 + 4) / 72
        fitted = 0
        for claim in claims:
            need = lines_needed(claim.text + " 00,00", w - 0.3, size) * size * 1.22 / 72 + 8 / 72
            if used + need > h:
                break
            p = tf.paragraphs[0] if (fitted == 0 and not label) else tf.add_paragraph()
            p.space_after = Pt(8)
            self._run(p, "▪  ", size=size, color=style.NAVY)
            self._run(p, claim.text, size=size, color=style.INK)
            if claim.notes:
                self._run(
                    p,
                    " " + ",".join(str(n) for n in claim.notes),
                    size=size,
                    color=style.NAVY,
                    sup=True,
                )
                self.used_notes.extend(claim.notes)
            used += need
            fitted += 1
        return fitted

    def more_line(self, s, shown: int, total: int, x=LEFT, y=6.6):
        if total > shown:
            more = total - shown
            self.text(
                s,
                x,
                y,
                8,
                0.25,
                f"{more} more checked claim{'s' if more != 1 else ''} in the PDF report.",
                size=10,
                italic=True,
                color=style.GREY,
            )

    # --- small charts drawn with shapes --------------------------------------------------------

    def range_bar(self, s, x, y, w, *, big=True):
        n = self.d.numbers
        rng, price = n.get("range") or {}, (n.get("price") or {}).get("value")
        if not all(isinstance(rng.get(k), int | float) for k in ("bear", "base", "bull")):
            self.text(
                s,
                x,
                y,
                w,
                0.3,
                "The 12-month range is not stored for this report.",
                size=12,
                color=style.GREY,
            )
            return
        lo, hi = rng["bear"] * 0.92, rng["bull"] * 1.04
        if isinstance(price, int | float):
            lo, hi = min(lo, price * 0.95), max(hi, price * 1.05)

        def at(v: float) -> float:
            return x + (v - lo) / (hi - lo) * w

        bar_y, bar_h = y + 0.42, 0.14 if big else 0.1
        self.rect(
            s,
            at(rng["bear"]),
            bar_y,
            at(rng["bull"]) - at(rng["bear"]),
            bar_h,
            style.TINT,
            shape=MSO_SHAPE.ROUNDED_RECTANGLE,
        )
        dot = 0.2 if big else 0.14
        for key, color in (("bear", style.BEAR), ("base", style.BASE), ("bull", style.BULL)):
            self.rect(
                s,
                at(rng[key]) - dot / 2,
                bar_y + bar_h / 2 - dot / 2,
                dot,
                dot,
                color,
                shape=MSO_SHAPE.OVAL,
            )
        size = 14 if big else 11
        for key, color, align, lx in (
            ("bear", style.BEAR, PP_ALIGN.LEFT, x),
            ("base", style.BASE, PP_ALIGN.CENTER, x + w / 2 - 1.3),
            ("bull", style.BULL, PP_ALIGN.RIGHT, x + w - 2.6),
        ):
            self.text(
                s,
                lx,
                bar_y + 0.25,
                2.6,
                0.3,
                f"{key.capitalize()} {money(rng[key])}",
                size=size,
                bold=True,
                color=color,
                align=align,
            )
        if isinstance(price, int | float):
            px = at(price)
            self.line(s, px, bar_y - 0.12, px, bar_y + bar_h + 0.04, style.INK, 1.5)
            self.text(
                s,
                px - 1.2,
                y,
                2.4,
                0.3,
                f"Price {money(price)}",
                size=size - 1,
                color=style.INK,
                align=PP_ALIGN.CENTER,
            )

    def price_chart(self, s, x, y, w, h):
        """The 12-month weekly close as a line drawn with shapes, so it looks the same in
        PowerPoint, Keynote and Google Slides: gridlines with $ labels on the left, one month
        label a month along the bottom."""
        weekly = self.d.numbers.get("weekly") or []
        if not weekly:
            self.text(
                s,
                x,
                y,
                w,
                0.3,
                "Weekly prices are not stored for this report.",
                size=12,
                color=style.GREY,
            )
            return
        closes = [float(p["close"]) for p in weekly]
        days = [date.fromisoformat(str(p["date"])) for p in weekly]
        lo, hi = min(closes), max(closes)
        step = _nice_step((hi - lo) / 3 or 1)
        bottom_v = math.floor(lo / step) * step
        top_v = math.ceil(hi / step) * step
        if top_v == bottom_v:
            top_v += step
        label_w, foot = 0.6, 0.28
        px0, px1 = x + label_w, x + w
        py0, py1 = y, y + h - foot

        def at(i: int, v: float) -> tuple[float, float]:
            return (
                px0 + (px1 - px0) * i / max(1, len(closes) - 1),
                py1 - (py1 - py0) * (v - bottom_v) / (top_v - bottom_v),
            )

        v = bottom_v
        while v <= top_v + 1e-9:
            gy = at(0, v)[1]
            self.line(s, px0, gy, px1, gy, style.GRID if v > bottom_v else style.RULE, 0.75)
            self.text(
                s,
                x,
                gy - 0.1,
                label_w - 0.1,
                0.2,
                f"${v:,.0f}",
                size=9,
                color=style.GREY,
                align=PP_ALIGN.RIGHT,
            )
            v += step
        points = [at(i, c) for i, c in enumerate(closes)]
        build = s.shapes.build_freeform(Inches(points[0][0]), Inches(points[0][1]), scale=1.0)
        build.add_line_segments([(Inches(a), Inches(b)) for a, b in points[1:]], close=False)
        shape = build.convert_to_shape()
        shape.fill.background()
        shape.line.color.rgb = _rgb(style.NAVY)
        shape.line.width = Pt(2)
        shape.shadow.inherit = False
        seen: set[tuple[int, int]] = set()
        for i, day in enumerate(days):
            if (day.year, day.month) in seen:
                continue
            seen.add((day.year, day.month))
            mx = at(i, bottom_v)[0]
            text = day.strftime("%b %y" if len(seen) == 1 or day.month == 1 else "%b")
            self.text(
                s,
                mx - 0.4,
                py1 + 0.06,
                0.8,
                0.2,
                text,
                size=9,
                color=style.GREY,
                align=PP_ALIGN.CENTER,
            )

    def bars(
        self,
        s,
        x,
        y,
        w,
        rows: list[tuple[str, float, str]],
        *,
        scale_max: float,
        marker: tuple[float, str] | None = None,
        row_h=0.42,
        color=style.NAVY,
        label_w=3.2,
        value_in_label: bool = False,
    ):
        """Horizontal bars drawn as shapes: (label, value, value text). An optional marker line
        (value, label) is drawn across them, such as the price."""
        bar_x, bar_w = x + label_w, w - label_w - (0.3 if value_in_label else 1.3)
        for i, (label, value, value_text) in enumerate(rows):
            ry = y + i * row_h
            self.text(
                s,
                x,
                ry + 0.04,
                label_w - 0.15,
                row_h,
                f"{label}   {value_text}" if value_in_label else label,
                size=12,
                color=style.INK,
                align=PP_ALIGN.RIGHT,
            )
            length = max(0.02, bar_w * value / scale_max) if value > 0 else 0.02
            self.rect(
                s,
                bar_x,
                ry + 0.06,
                length,
                row_h - 0.16,
                color if not label.startswith("Estimated") else style.BULL,
            )
            if not value_in_label:
                self.text(
                    s,
                    bar_x + length + 0.08,
                    ry + 0.04,
                    1.4,
                    row_h,
                    value_text,
                    size=12,
                    bold=True,
                    color=style.INK,
                )
        if marker:
            mv, mlabel = marker
            mx = bar_x + bar_w * mv / scale_max
            top, bottom = y - 0.1, y + len(rows) * row_h
            self.line(s, mx, top, mx, bottom, style.BEAR, 1.5, dash=True)
            self.text(
                s,
                mx - 1.5,
                top - 0.3,
                3.0,
                0.3,
                mlabel,
                size=11,
                bold=True,
                color=style.BEAR,
                align=PP_ALIGN.CENTER,
            )


# --- the slides ---------------------------------------------------------------------------------


def _upside(d: ExportData) -> float | None:
    base = (d.numbers.get("range") or {}).get("base")
    price = (d.numbers.get("price") or {}).get("value")
    return (
        base / price - 1
        if isinstance(base, int | float) and isinstance(price, int | float) and price
        else None
    )


def _horizon(d: ExportData) -> str:
    if d.price_day is None:
        return "12 months"
    return date(d.price_day.year + 1, d.price_day.month, 1).strftime("%b %Y")


def _verdict(d: ExportData) -> str:
    rating = (d.numbers.get("rating") or {}).get("call")
    base = (d.numbers.get("range") or {}).get("base")
    up = _upside(d)
    if not rating:
        return "No rating is stored for this report."
    if isinstance(base, int | float) and up is not None:
        return f"{rating}: base case {money(base)} by {_horizon(d)}, {abs(up):.1%} {'above' if up >= 0 else 'below'} today's price"
    return f"Rated {rating} against its peer group"


def _source_numbers(d: ExportData) -> str:
    when = f" to {day_text(d.price_day)}" if d.price_day else ""
    return f"Source: SEC EDGAR filings, prices{when}, Tearsheet calculations."


def _cover(k: _Deck) -> None:
    d, n = k.d, k.d.numbers
    # "Rating", not "Recommendation": the deck's own disclaimer says it is not a recommendation.
    s = k.slide("Rating", "", _source_numbers(d))
    k.text(
        s,
        LEFT,
        1.25,
        RIGHT - LEFT,
        0.7,
        [
            (d.name + " ", {"bold": True, "color": style.NAVY}),
            (f"({d.ticker})", {"color": style.GREY}),
        ],
        size=36,
    )
    k.text(s, LEFT, 1.95, RIGHT - LEFT, 0.45, _verdict(d), size=20, color=style.INK)
    k.signature_rule(s, LEFT, 2.5, 2.4)
    # The call box.
    k.rect(s, LEFT, 2.8, 3.7, 2.3, None, style.NAVY, 1.5)
    rating = (n.get("rating") or {}).get("call") or "Not rated"
    k.text(
        s,
        LEFT + 0.2,
        2.92,
        3.3,
        0.55,
        rating.upper(),
        size=30,
        bold=True,
        color=style.NAVY,
        spacing=100,
    )
    price = n.get("price") or {}
    rows = [
        (
            f"Price ({price.get('date')})" if price.get("date") else "Price",
            money(price["value"]) if isinstance(price.get("value"), int | float) else "n/a",
        ),
        (
            "12-month base case",
            money(n["range"]["base"]) if (n.get("range") or {}).get("base") is not None else "n/a",
        ),
        ("Upside", pct(_upside(d), signed=True) if _upside(d) is not None else "n/a"),
        (
            "Estimated value",
            money(n["estimate"]["value"])
            if (n.get("estimate") or {}).get("value") is not None
            else "n/a",
        ),
        ("Uncertainty", str((n.get("rating") or {}).get("uncertainty") or "n/a").capitalize()),
    ]
    for i, (label, value) in enumerate(rows):
        y = 3.55 + i * 0.3
        k.text(s, LEFT + 0.2, y, 2.0, 0.3, label, size=13, color=style.GREY)
        k.text(
            s,
            LEFT + 1.9,
            y,
            1.6,
            0.3,
            value,
            size=13,
            bold=True,
            color=style.INK,
            align=PP_ALIGN.RIGHT,
        )
    # The range and three points written from the numbers.
    k.text(s, 4.9, 2.8, 4, 0.3, "12-MONTH RANGE", size=11, bold=True, color=style.NAVY, spacing=100)
    k.range_bar(s, 4.9, 3.05, RIGHT - 4.9)
    points = []
    score = (n.get("score") or {}).get("percentile")
    if score is not None:
        group = (
            f" of its {d.peer_count}-company peer group" if d.peer_count else " of its peer group"
        )
        points.append(f"Scores in the {ordinal(int(score))} percentile{group}")
    used = [m for m in d.methods if m.value is not None]
    est = (n.get("estimate") or {}).get("value")
    if est is not None and used:
        short = [SHORT_METHOD.get(m.code, m.label) for m in used]
        names = " and ".join(short) if len(short) <= 2 else f"{len(short)} methods"
        points.append(f"Estimated value {money(est)}: the median of {names}")
    ret = next((r for r in d.views.get("returns") or [] if r.get("years") == 1), None)
    if ret:
        c, p, spy = ((ret.get(key) or {}).get("value") for key in ("company", "peers", "spy"))
        if all(isinstance(v, int | float) for v in (c, p, spy)):
            points.append(
                f"Total return past 12 months {c:.1f}%, against {p:.1f}% for peers and {spy:.1f}% for the S&P 500"
            )
    box = s.shapes.add_textbox(Inches(4.9), Inches(4.12), Inches(RIGHT - 4.9), Inches(1.1))
    tf = box.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    for i, text in enumerate(points):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.space_after = Pt(4)
        k._run(para, "▪  ", size=14, color=style.NAVY)
        k._run(para, text, size=14, color=style.INK)
    k.text(
        s,
        LEFT,
        5.25,
        6,
        0.25,
        "SHARE PRICE, PAST 12 MONTHS (US$, WEEKLY CLOSES)",
        size=10,
        bold=True,
        color=style.NAVY,
        spacing=100,
    )
    k.price_chart(s, LEFT - 0.1, 5.6, RIGHT - LEFT + 0.2, 1.3)


def _key_points(k: _Deck) -> None:
    d = k.d
    points = d.key_points()
    s = k.slide(
        "Key points",
        f"{len(points)} key points from the filings and news, each checked against its source",
        "Sources: the numbered notes in the appendix. Every claim passed the numeric guard, citation check and skeptic.",
    )
    claims = [Claim(c.id, f"{sec.title}: {c.text}", c.checker_note, c.notes) for sec, c in points]
    shown = k.claims(s, claims, LEFT, TOP_BODY, RIGHT - LEFT, BOTTOM_BODY - TOP_BODY - 0.2, size=14)
    k.more_line(s, shown, len(claims))
    if not claims:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No claim passed the checks in this report.",
            size=14,
            color=style.GREY,
        )


def _section_slide(k: _Deck, keys: list[str], kicker: str, name: str | None = None) -> None:
    d = k.d
    sections = [d.section(key) for key in keys]
    sections = [x for x in sections if x is not None]
    total = sum(len(x.claims) for x in sections)
    title = name or (" and ".join(x.title for x in sections) if sections else kicker)
    s = k.slide(
        kicker,
        f"{title}: {total} checked claim{'s' if total != 1 else ''}",
        "Sources: the numbered notes in the appendix. Every claim passed the numeric guard, citation check and skeptic.",
    )
    if not sections or total == 0:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No claim in this section passed the checks.",
            size=14,
            color=style.GREY,
        )
        return
    if len(sections) == 1:
        shown = k.claims(
            s,
            list(sections[0].claims),
            LEFT,
            TOP_BODY,
            RIGHT - LEFT,
            BOTTOM_BODY - TOP_BODY - 0.2,
            size=14,
        )
        k.more_line(s, shown, total)
        return
    col_w = (RIGHT - LEFT - 0.4) / 2
    shown = 0
    for i, sec in enumerate(sections[:2]):
        shown += k.claims(
            s,
            list(sec.claims),
            LEFT + i * (col_w + 0.4),
            TOP_BODY,
            col_w,
            BOTTOM_BODY - TOP_BODY - 0.2,
            size=13,
            label=sec.title,
        )
    k.more_line(s, shown, total)


def _valuation(k: _Deck) -> None:
    d, n = k.d, k.d.numbers
    est = (n.get("estimate") or {}).get("value")
    price = (n.get("price") or {}).get("value")
    used = [m for m in d.methods if m.value is not None]
    if est is not None and isinstance(price, int | float):
        title = f"Estimated value {money(est)}, the median of {len(used)} method{'s' if len(used) != 1 else ''}; price {money(price)}"
    else:
        title = "Value per share by method"
    s = k.slide("Valuation", title, _source_numbers(d))
    if not d.methods:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No valuation is stored for this report.",
            size=14,
            color=style.GREY,
        )
        return
    rows = [
        [
            m.label,
            money(m.value) if m.value is not None else "not used",
            pct(m.value / price - 1, True)
            if m.value is not None and isinstance(price, int | float)
            else "",
            m.note,
        ]
        for m in d.methods
    ]
    if est is not None:
        rows.append(
            [
                "Estimated value (median of the methods used)",
                money(est),
                pct(est / price - 1, True) if isinstance(price, int | float) else "",
                "",
            ]
        )
    k.table(
        s,
        LEFT,
        TOP_BODY,
        6.6,
        [["Method", "US$ per share", "vs price", "Note"]] + rows,
        [2.6, 1.2, 0.9, 1.9],
        size=11,
        right=(1, 2),
        row_h=0.42,
        bold_last=est is not None,
    )
    bars = [(m.label.split(" (")[0], m.value, money(m.value)) for m in used]
    if est is not None:
        bars.append(("Estimated value", est, money(est)))
    if bars:
        top = max([b[1] for b in bars] + ([price] if isinstance(price, int | float) else []))
        k.text(
            s,
            7.6,
            TOP_BODY - 0.05,
            5,
            0.3,
            "VALUE PER SHARE, US$",
            size=11,
            bold=True,
            color=style.NAVY,
            spacing=100,
        )
        k.bars(
            s,
            7.4,
            TOP_BODY + 0.4,
            RIGHT - 7.4,
            bars,
            scale_max=top * 1.05,
            marker=(price, f"Price {money(price)}") if isinstance(price, int | float) else None,
            label_w=3.0,
            value_in_label=True,
        )


def _range(k: _Deck) -> None:
    d, n = k.d, k.d.numbers
    rng = n.get("range") or {}
    price = (n.get("price") or {}).get("value")
    up = _upside(d)
    if (
        all(isinstance(rng.get(x), int | float) for x in ("bear", "base", "bull"))
        and up is not None
    ):
        title = f"12-month range {money(rng['bear'])} to {money(rng['bull'])}; base case {money(rng['base'])}, {abs(up):.1%} {'above' if up >= 0 else 'below'} the price"
    else:
        title = "The 12-month range"
    s = k.slide("Bear, base and bull", title, _source_numbers(d))
    k.range_bar(s, LEFT + 0.3, TOP_BODY, RIGHT - LEFT - 0.6)
    if not rng:
        return
    meaning = {
        "bear": "10th percentile of the 12-month spread",
        "base": "50th percentile: the price grown at the cost of equity less the dividend yield, plus a third of the gap to estimated value",
        "bull": "90th percentile of the 12-month spread",
    }
    rows = [["Case", "US$", "vs price", "What it means"]]
    for key in ("bear", "base", "bull"):
        v = rng.get(key)
        rows.append(
            [
                key.capitalize(),
                money(v) if isinstance(v, int | float) else "n/a",
                pct(v / price - 1, True)
                if isinstance(v, int | float) and isinstance(price, int | float)
                else "",
                meaning[key],
            ]
        )
    if isinstance(price, int | float):
        rows.append(
            ["Price", money(price), "", f"Close on {day_text(d.price_day)}" if d.price_day else ""]
        )
    k.table(
        s,
        LEFT,
        3.45,
        RIGHT - LEFT,
        rows,
        [1.4, 1.4, 1.2, RIGHT - LEFT - 4.0],
        size=12,
        right=(1, 2),
        row_h=0.42,
    )
    unc = (n.get("rating") or {}).get("uncertainty")
    if unc:
        k.text(
            s,
            LEFT,
            5.75,
            RIGHT - LEFT,
            0.6,
            f"Uncertainty: {unc}. The range is a statistical spread for the next 12 months, not a price target.",
            size=13,
            color=style.GREY,
        )


def _score(k: _Deck) -> None:
    d, n = k.d, k.d.numbers
    score = (n.get("score") or {}).get("percentile")
    group = f" {d.peer_count}-company" if d.peer_count else ""
    title = (
        f"Scores in the {ordinal(int(score))} percentile of its{group} peer group"
        if score is not None
        else "Score against peers"
    )
    s = k.slide(
        "Score vs peers", title, "Source: Tearsheet calculations on SEC EDGAR filings and prices."
    )
    factors = n.get("factors") or []
    if not factors:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No score is stored for this report.",
            size=14,
            color=style.GREY,
        )
        return
    k.text(
        s,
        LEFT,
        TOP_BODY - 0.05,
        6,
        0.3,
        "FACTOR PERCENTILES (0–100) AND WEIGHTS",
        size=11,
        bold=True,
        color=style.NAVY,
        spacing=100,
    )
    rows = [
        (
            f"{str(f['name']).capitalize()} ({f['weight']:.0%})",
            float(f["percentile"]),
            str(f["percentile"]),
        )
        for f in factors
    ]
    k.bars(s, LEFT, TOP_BODY + 0.4, 7.6, rows, scale_max=100, row_h=0.5, label_w=3.0)
    ratings = (d.views.get("peer_ratings") or {}).get("slices") or []
    if ratings:
        k.text(
            s,
            8.8,
            TOP_BODY - 0.05,
            4,
            0.3,
            "THE PEER GROUP TODAY",
            size=11,
            bold=True,
            color=style.NAVY,
            spacing=100,
        )
        rows = [["Rating", "Companies"]] + [
            [str(x.get("label")), str(x.get("count"))] for x in ratings
        ]
        k.table(
            s,
            8.8,
            TOP_BODY + 0.4,
            RIGHT - 8.8,
            rows,
            [2.4, RIGHT - 8.8 - 2.4],
            size=12,
            right=(1,),
            row_h=0.42,
        )
        k.text(
            s,
            8.8,
            TOP_BODY + 0.5 + 0.42 * len(rows),
            RIGHT - 8.8,
            0.6,
            "Rated before red-flag caps, as the report counts them.",
            size=11,
            color=style.GREY,
        )


def _metrics(k: _Deck) -> None:
    d = k.d
    metrics = d.views.get("metrics") or []
    s = k.slide(
        "Key metrics",
        f"Key metrics against the peer median ({len(metrics)} measure{'s' if len(metrics) != 1 else ''})",
        "Source: Tearsheet calculations on SEC EDGAR filings; percentiles are the share of peers below the company.",
    )
    if not metrics:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No key metrics are stored for this report.",
            size=14,
            color=style.GREY,
        )
        return
    rows = [["Metric", d.ticker, "Peer median", "Percentile"]]
    for m in metrics[:9]:
        rows.append(
            [
                str(m.get("label")),
                str(m.get("text") or "n/a"),
                str(m.get("median_text") or "n/a"),
                str(m.get("percentile") if m.get("percentile") is not None else "n/a"),
            ]
        )
    k.table(
        s, LEFT, TOP_BODY, 8.4, rows, [4.2, 1.4, 1.4, 1.4], size=13, right=(1, 2, 3), row_h=0.44
    )


def _returns(k: _Deck) -> None:
    d = k.d
    one = next((r for r in d.views.get("returns") or [] if r.get("years") == 1), None)
    vals = [((one or {}).get(x) or {}).get("value") for x in ("company", "peers", "spy")]
    if all(isinstance(v, int | float) for v in vals):
        title = f"Total return past 12 months: {d.ticker} {vals[0]:.1f}%, peers {vals[1]:.1f}%, S&P 500 {vals[2]:.1f}%"
    else:
        title = "Returns and price"
    s = k.slide(
        "Returns and price",
        title,
        _source_numbers(d) + " Total returns include dividends; peers weighted equally.",
    )
    k.text(
        s,
        LEFT,
        TOP_BODY - 0.05,
        6,
        0.3,
        "SHARE PRICE, PAST 12 MONTHS (US$, WEEKLY CLOSES)",
        size=11,
        bold=True,
        color=style.NAVY,
        spacing=100,
    )
    k.price_chart(s, LEFT - 0.1, TOP_BODY + 0.25, 7.6, 4.1)
    rows = [["Total return", d.ticker, "Peers", "S&P 500"]]
    for r in d.views.get("returns") or []:
        cells = [(r.get(x) or {}).get("value") for x in ("company", "peers", "spy")]
        rows.append(
            [f"Past {r.get('years')} year{'s' if r.get('years') != 1 else ''}"]
            + [f"{v:.1f}%" if isinstance(v, int | float) else "n/a" for v in cells]
        )
    if len(rows) > 1:
        k.table(
            s,
            8.3,
            TOP_BODY + 0.25,
            RIGHT - 8.3,
            rows,
            [1.5, 0.85, 0.85, 1.233],
            size=12,
            right=(1, 2, 3),
            row_h=0.42,
        )


def _risks(k: _Deck) -> None:
    d = k.d
    sec = d.section("risks")
    flags = [p for p in (sec.paragraphs if sec else ()) if p.startswith("Red flag:")]
    found = [f for f in d.views.get("red_flags") or [] if f.get("found")]
    if found:
        names = ", ".join(str(f.get("label")) for f in found)
        title = f"Risks: {len(found)} red flag{'s' if len(found) != 1 else ''} found ({names}); any red flag caps the rating at Hold"
    else:
        title = f"Risks: no red flags in {len(d.views.get('red_flags') or [])} checks; {len(sec.claims) if sec else 0} checked claims"
    s = k.slide(
        "Risks",
        title,
        "Sources: the numbered notes in the appendix; red-flag checks are Tearsheet's, on SEC filings.",
    )
    y = TOP_BODY
    for f in flags[:2]:
        k.rect(s, LEFT, y, RIGHT - LEFT, 0.5, "#FBE9E1")
        k.text(
            s,
            LEFT + 0.15,
            y + 0.08,
            RIGHT - LEFT - 0.3,
            0.4,
            [
                ("Red flag: ", {"bold": True, "color": style.BEAR}),
                (f[len("Red flag:") :].strip(), {}),
            ],
            size=12,
        )
        y += 0.6
    claims = list(sec.claims) if sec else []
    shown = k.claims(s, claims, LEFT, y + 0.1, RIGHT - LEFT, BOTTOM_BODY - y - 0.3, size=14)
    k.more_line(s, shown, len(claims))


def _watch(k: _Deck) -> None:
    d = k.d
    sec = d.section("watch")
    trig = d.numbers.get("triggers") or {}

    def trig_text(side: str) -> str:
        v = trig.get(side)
        return (
            money(v)
            if isinstance(v, int | float)
            else str(trig.get(f"{side}_text") or "not stored")
        )

    if not trig:
        title = "What to watch"
    elif trig_text("buy") == trig_text("sell") and not isinstance(trig.get("buy"), int | float):
        title = f"What to watch: neither a buy nor a sell trigger is {trig_text('buy')}"
    else:
        title = f"What to watch: buy trigger {trig_text('buy')}; sell trigger {trig_text('sell')}"
    s = k.slide(
        "What to watch",
        title,
        "Sources: the numbered notes in the appendix. Triggers hold the score and peers' value gaps fixed.",
    )
    claims = list(sec.claims) if sec else []
    shown = k.claims(s, claims, LEFT, TOP_BODY, RIGHT - LEFT, BOTTOM_BODY - TOP_BODY - 0.2, size=14)
    k.more_line(s, shown, len(claims))


def _economy(k: _Deck) -> None:
    d = k.d
    s = k.slide(
        "Appendix A1",
        "The economy when the report was made",
        "Source: FRED, Federal Reserve Bank of St. Louis.",
    )
    econ = d.views.get("economy") or []
    if not econ:
        k.text(
            s,
            LEFT,
            TOP_BODY,
            10,
            0.4,
            "No economic series are stored for this report.",
            size=14,
            color=style.GREY,
        )
        return
    rows = [["Series", "Value", "As of"]] + [
        [str(e.get("label")), str(e.get("value")), str(e.get("date"))] for e in econ
    ]
    k.table(s, LEFT, TOP_BODY, 8, rows, [4.6, 1.6, 1.8], size=13, right=(1,), row_h=0.44)


def _checks(k: _Deck) -> None:
    d, v = k.d, k.d.views
    claims = v.get("claims") or {}
    kept = next(
        (x.get("count") for x in claims.get("slices") or [] if x.get("key") == "kept"), None
    )
    title = (
        f"How the report was checked: {kept} of {claims.get('total')} claims passed every check"
        if kept is not None
        else "How the report was checked"
    )
    s = k.slide("Appendix A2", title, "Source: Tearsheet's checks, run when the report was made.")
    lines = []
    if d.checks:
        lines.append(
            "Checks on every claim: "
            + ", ".join(d.checks)
            + (f" ({d.skeptic})." if d.skeptic else ".")
        )
    for x in claims.get("slices") or []:
        if x.get("readout"):
            lines.append(str(x["readout"]))
    if v.get("red_flags_readout"):
        lines.append(str(v["red_flags_readout"]))
    lines.append(d.mode_note)
    box = s.shapes.add_textbox(Inches(LEFT), Inches(TOP_BODY), Inches(6.2), Inches(4.2))
    tf = box.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    for i, text in enumerate(t for t in lines if t):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        k._run(p, "▪  ", size=13, color=style.NAVY)
        k._run(p, text, size=13, color=style.INK)
    flags = v.get("red_flags") or []
    if flags:
        rows = [["Red-flag check", "Result"]] + [
            [str(f.get("label")), "Found" if f.get("found") else "Clear"] for f in flags
        ]
        k.table(
            s,
            7.4,
            TOP_BODY,
            RIGHT - 7.4,
            rows,
            [3.6, RIGHT - 7.4 - 3.6],
            size=12,
            right=(1,),
            row_h=0.42,
        )


def _method(k: _Deck) -> None:
    d = k.d
    s = k.slide(
        "Appendix A3",
        "How the rating, score and range are made",
        f"Source: Tearsheet methodology, method code version {d.method_code_version}.",
    )
    lines = d.methodology or ["The methodology is not stored for this report."]
    box = s.shapes.add_textbox(
        Inches(LEFT), Inches(TOP_BODY), Inches(RIGHT - LEFT), Inches(BOTTOM_BODY - TOP_BODY)
    )
    tf = box.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    size = 13 if sum(lines_needed(x, RIGHT - LEFT - 0.3, 13) for x in lines) <= 18 else 11
    for i, text in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(6)
        k._run(p, "▪  ", size=size, color=style.NAVY)
        k._run(p, text, size=size, color=style.INK)


def _sources(k: _Deck) -> None:
    """The notes this deck used, two columns a slide, as many slides as they need."""
    d = k.d
    wanted = sorted(set(k.used_notes))
    by_number = {n.number: n for n in d.notes}
    notes = [by_number[x] for x in wanted if x in by_number]
    # Neighbouring notes that cite the same passage of the same source share one line.
    runs: list[list] = []
    for note in notes:
        last = runs[-1][-1] if runs else None
        if (
            last
            and note.number == last.number + 1
            and (note.label, note.section, note.url) == (last.label, last.section, last.url)
        ):
            runs[-1].append(note)
        else:
            runs.append([note])
    notes = runs
    per_col, per_slide = 18, 36
    chunks = [notes[i : i + per_slide] for i in range(0, len(notes), per_slide)] or [[]]
    for c, chunk in enumerate(chunks):
        part = f" ({c + 1} of {len(chunks)})" if len(chunks) > 1 else ""
        s = k.slide(
            f"Appendix A{4 + c}",
            f"Sources{part}: the notes on these slides",
            "Every note's quoted passage is in the PDF report and the Excel workbook's Sources tab.",
        )
        if not chunk:
            k.text(
                s,
                LEFT,
                TOP_BODY,
                10,
                0.4,
                "No claim on these slides cites a source.",
                size=14,
                color=style.GREY,
            )
            continue
        col_w = (RIGHT - LEFT - 0.4) / 2
        for col in range(2):
            items = chunk[col * per_col : (col + 1) * per_col]
            if not items:
                continue
            box = s.shapes.add_textbox(
                Inches(LEFT + col * (col_w + 0.4)),
                Inches(TOP_BODY - 0.1),
                Inches(col_w),
                Inches(4.6),
            )
            tf = box.text_frame
            tf.word_wrap = True
            for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
                setattr(tf, side, 0)
            for i, run in enumerate(items):
                note = run[0]
                numbers = f"{run[0].number}–{run[-1].number}" if len(run) > 1 else str(note.number)
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.space_after = Pt(3)
                k._run(p, f"{numbers}  ", size=11, bold=True, color=style.NAVY)
                k._run(p, f"{note.label} · {note.section}", size=11, color=style.INK)
                if note.url:
                    r = k._run(p, "  link", size=11, color=style.BULL)
                    r.hyperlink.address = note.url


def _important(k: _Deck) -> None:
    d = k.d
    s = k.slide("Appendix", "Important information", "Tearsheet Research.")
    lines = [style.DISCLAIMER]
    if d.prediction:
        lines.append(
            f"This report is logged as an official prediction ({d.prediction['prediction_id']}) and is graded at 3, 6 and 12 months against its peer group."
        )
    else:
        lines.append(
            "This report is not logged as an official prediction: only a company's first rated report in 30 days is."
        )
    if d.price_day:
        lines.append(
            f"Prices are as of {day_text(d.price_day)}, in that day's shares."
            + (
                f" The stock has split {d.split_factor:g}-for-1 since."
                if abs(d.split_factor - 1) > 1e-9
                else ""
            )
        )
    lines.append(
        f"Report {d.report_id}, run {d.run_id}, engine {d.engine_version}, method code version {d.method_code_version}."
    )
    box = s.shapes.add_textbox(
        Inches(LEFT), Inches(TOP_BODY), Inches(RIGHT - LEFT), Inches(BOTTOM_BODY - TOP_BODY)
    )
    tf = box.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    for i, text in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(10)
        k._run(p, text, size=14 if i == 0 else 12, color=style.INK if i == 0 else style.GREY)


def build(data: ExportData) -> bytes:
    """The deck's bytes."""
    k = _Deck(data)
    _cover(k)
    _key_points(k)
    _section_slide(k, ["business"], "The business")
    _section_slide(k, ["results"], "Recent results")
    _section_slide(k, ["news", "trends"], "News and industry trends", "News and industry trends")
    _valuation(k)
    _range(k)
    _score(k)
    _metrics(k)
    _returns(k)
    _risks(k)
    _watch(k)
    _economy(k)
    _checks(k)
    _method(k)
    _sources(k)
    _important(k)
    out = io.BytesIO()
    k.prs.save(out)
    return out.getvalue()
