"""The Excel download, styled as a classic bank model (Liam's picks on 8 Nov 2026): white, Arial,
thin grey rules, bold totals, navy only for titles; figures typed in from the filings or the
saved report in blue, formulas in black. Five tabs: Summary · Financials · Valuation · Peers ·
Sources & checks. Every typed figure carries a hover note saying where it came from.

Nothing recalculates the report or its rating. The formulas are the working a model shows:
growth, margins, free cash flow, the median of the valuation methods, upside, peer medians, and
checks that fail if a figure was copied wrong. Each formula's cached result is written with it,
so Quick Look and previews show the numbers before Excel recalculates.
"""

from __future__ import annotations

import io
import statistics
from datetime import date, datetime
from typing import Any

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell

from tearsheet.export import style
from tearsheet.export.data import LABEL, ExportData, Figure, day_text
from tearsheet.export.data import METHOD_LABELS as LABELS
from tearsheet.render import METRIC_KINDS

BLUE = "#0000FF"
NUM = '#,##0_);(#,##0);"–"_)'
NUM1 = '#,##0.0_);(#,##0.0);"–"_)'
MONEY = "$#,##0.00_);($#,##0.00)"
PCT = '0.0%_);(0.0%);"–"_)'
MULT = '0.0"x"'
INT = "#,##0"
CHECKS = "'Sources & checks'"


class _Book:
    def __init__(self, data: ExportData) -> None:
        self.d = data
        self.out = io.BytesIO()
        self.wb = xlsxwriter.Workbook(self.out, {"in_memory": True})
        self.wb.set_properties(
            {
                "title": f"{data.name} ({data.ticker}): Tearsheet report",
                "author": "Tearsheet Research",
                "comments": LABEL,
            }
        )
        self.wb.set_size(1600, 1000)
        self.f: dict[str, Any] = {}
        self.checks: list[dict[str, Any]] = []
        base = {"font_name": "Arial", "font_size": 10, "valign": "vcenter"}

        def fmt(name: str, **kw: Any) -> None:
            self.f[name] = self.wb.add_format({**base, **kw})

        fmt("label")
        fmt("wrap", text_wrap=True, valign="top")
        fmt("muted", font_color=style.GREY)
        fmt("muted_r", font_color=style.GREY, align="right")
        fmt("muted_wrap", font_color=style.GREY, text_wrap=True, valign="top")
        fmt("small", font_size=8, font_color=style.GREY)
        fmt("small_r", font_size=8, font_color=style.GREY, align="right")
        fmt(
            "small_wrap_r",
            font_size=8,
            font_color=style.GREY,
            align="right",
            text_wrap=True,
            valign="top",
        )
        fmt("small_date", font_size=8, font_color=BLUE, num_format="d mmm yyyy")
        fmt("title", bold=True, font_size=14, font_color=style.NAVY)
        fmt("headline", font_size=12)
        fmt("subtitle", italic=True, font_size=9, font_color=style.GREY)
        fmt("brand", bold=True, font_size=8, font_color=style.NAVY, align="right")
        fmt("rule", bottom=2, bottom_color=style.NAVY)
        fmt("section", bold=True, bg_color=style.FILL, bottom=1, bottom_color=style.RULE)
        fmt(
            "section_r",
            bold=True,
            bg_color=style.FILL,
            bottom=1,
            bottom_color=style.RULE,
            align="right",
        )
        fmt(
            "section_wrap",
            bold=True,
            bg_color=style.FILL,
            bottom=1,
            bottom_color=style.RULE,
            align="right",
            text_wrap=True,
            valign="bottom",
        )
        fmt("head", bold=True, bottom=1, align="right")
        fmt("head_l", bold=True, bottom=1)
        fmt("sub", font_size=8, font_color=style.GREY, align="right")
        fmt("indent", indent=1, italic=True, font_color=style.GREY)
        fmt("bold", bold=True)
        fmt("total_label", bold=True, top=1)
        fmt("na", font_color=style.GREY, align="right")
        for name, num in (
            ("num", NUM),
            ("num1", NUM1),
            ("money", MONEY),
            ("pct", PCT),
            ("mult", MULT),
            ("int", INT),
        ):
            fmt(f"in_{name}", font_color=BLUE, num_format=num)
            fmt(f"f_{name}", num_format=num)
            fmt(f"fi_{name}", num_format=num, italic=True, font_color=style.GREY)
            fmt(f"tot_{name}", num_format=num, bold=True, top=1)
            fmt(f"hi_{name}", num_format=num, font_color=BLUE, bold=True, bg_color=style.TINT)
        fmt("in_text", font_color=BLUE)
        fmt("in_text_r", font_color=BLUE, align="right")
        fmt("in_wrap", font_color=BLUE, text_wrap=True, valign="top")
        fmt("f_text_r", align="right")
        fmt("hi_text", bold=True, bg_color=style.TINT)
        fmt("call", bold=True, font_size=16, font_color=style.NAVY, align="right")
        fmt("url", font_color=style.BULL, underline=1)
        fmt("ok", bold=True, align="center", font_color="#006100", bg_color="#C6EFCE")
        fmt("bad", bold=True, align="center", font_color="#9C0006", bg_color="#FFC7CE")

    # --- scaffolding -------------------------------------------------------------------------

    def sheet(
        self, name: str, subtitle: str, widths: dict[str, float], last_col: int, label_col: int = 1
    ):
        """A tab with the shared header: the company, the subtitle, the brand and the checks
        light, a rule, and the "not investment advice" label on the first row under the frozen
        header (row 4), from column `label_col`, so every tab shows it on screen as well as in
        its printed footer."""
        d = self.d
        ws = self.wb.add_worksheet(name)
        ws.hide_gridlines(2)
        ws.set_column(0, 0, 2)
        for cols, width in widths.items():
            ws.set_column(cols, width)
        ws.set_row(0, 22)
        ws.write(0, 1, f"{d.name} ({d.ticker})", self.f["title"])
        ws.write(1, 1, subtitle, self.f["subtitle"])
        ws.write(0, last_col, "TEARSHEET RESEARCH", self.f["brand"])
        ws.write(1, last_col - 1, "Checks", self.f["muted_r"])
        master = self.master()
        ws.write_formula(
            1, last_col, f"={CHECKS}!$C$4", self.f["ok" if master == "OK" else "bad"], master
        )
        for col in range(1, last_col + 1):
            ws.write_blank(2, col, None, self.f["rule"])
        ws.set_row(2, 6)
        ws.write(3, label_col, LABEL, self.f["small"])
        ws.set_landscape()
        ws.set_paper(1)
        ws.fit_to_pages(1, 0)
        ws.set_margins(left=0.4, right=0.4, top=0.5, bottom=0.6)
        ws.set_footer("&L&8Tearsheet Research · " + LABEL + "&R&8&A · page &P of &N")
        return ws

    def section(
        self, ws, row: int, first: int, last: int, text: str, right: dict[int, str] | None = None
    ) -> None:
        for col in range(first, last + 1):
            label = (right or {}).get(col)
            if col == first:
                ws.write(row, col, text, self.f["section"])
            elif label is not None:
                ws.write(row, col, label, self.f["section_r"])
            else:
                ws.write_blank(row, col, None, self.f["section"])

    def note(self, ws, row: int, col: int, text: str) -> None:
        ws.write_comment(
            row,
            col,
            text,
            {
                "font_name": "Arial",
                "font_size": 9,
                "x_scale": 2.4,
                "y_scale": 1.4,
                "author": "Tearsheet",
            },
        )

    def name(self, label: str, sheet: str, row: int, col: int) -> None:
        self.wb.define_name(label, f"='{sheet}'!${xl_col_to_name(col)}${row + 1}")

    def master(self) -> str:
        return "OK" if all(c["result"] == "OK" for c in self.checks) else "CHECK"


def _dt(day: date) -> datetime:
    return datetime(day.year, day.month, day.day)


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _upside(d: ExportData) -> float | None:
    base = _num((d.numbers.get("range") or {}).get("base"))
    price = _num((d.numbers.get("price") or {}).get("value"))
    return base / price - 1 if base is not None and price else None


def _headline(d: ExportData) -> str:
    """The call and its numbers, written by code, never AI text."""
    n = d.numbers
    rating = (n.get("rating") or {}).get("call")
    base = _num((n.get("range") or {}).get("base"))
    up = _upside(d)
    if not rating:
        return "No rating is stored for this report."
    text = str(rating)
    if base is not None and up is not None and d.price_day:
        horizon = date(d.price_day.year + 1, d.price_day.month, 1)
        side = "above" if up >= 0 else "below"
        text += f": base case ${base:,.2f} by {horizon:%b %Y}, {abs(up):.1%} {side} the price"
    unc = (n.get("rating") or {}).get("uncertainty")
    return text + (f", with {unc} uncertainty" if unc else "")


def _filed_note(d: ExportData, fig: Figure, *, scale: float, unit: str, ltm: bool) -> str:
    forms = {str(f.get("accession")): str(f.get("form")) for f in d.filings}
    form = forms.get(fig.accn, "SEC filing")
    if ltm and fig.start is not None:
        period = (
            f"Last 12 months to {day_text(fig.end)}: the latest fiscal year, plus this year to "
            "date, less the same period a year before (the engine's method)."
        )
    elif fig.start is not None:
        period = f"Fiscal year {day_text(fig.start)} to {day_text(fig.end)}."
    else:
        period = f"At {day_text(fig.end)}."
    exact = f"{fig.value:,.0f}" if abs(fig.value) >= 1000 else f"{fig.value:,.2f}"
    shown = f" (÷ {scale:,.0f} here)." if scale != 1 else "."
    return (
        f"{period}\nFrom the {form} filed {day_text(fig.filed)} (accession {fig.accn}).\n"
        f"SEC XBRL line: {fig.tag}.\nAs filed: {exact}{unit}{shown}"
    )


def _report_note(where: str, text: str | None = None) -> str:
    said = f"\nThe report says: “{text}”" if text else ""
    return f"From the saved report ({where}).{said}"


# --- checks: worked out first, so every tab's top corner can show the result -------------------


def _plan_checks(d: ExportData) -> list[dict[str, Any]]:
    n, v = d.numbers, d.views
    checks: list[dict[str, Any]] = []

    def add(what, formula, cached, against, against_value, tol, kind) -> None:
        ok = abs(cached - against_value) <= tol + 1e-9
        checks.append(
            {
                "what": what,
                "formula": formula,
                "cached": cached,
                "against": against,
                "against_value": against_value,
                "tol": tol,
                "kind": kind,
                "result": "OK" if ok else "CHECK",
            }
        )

    valid = [m.value for m in d.methods if m.value is not None]
    value = _num((n.get("estimate") or {}).get("value"))
    if valid and value is not None:
        add(
            "Estimated value: the median of the methods (formula) vs the report's",
            "=Value",
            statistics.median(valid),
            "=ReportValue",
            value,
            0.011,
            "money",
        )
    rng = n.get("range") or {}
    if all(_num(rng.get(k)) is not None for k in ("bear", "base", "bull")):
        ordered = 1.0 if rng["bear"] < rng["base"] < rng["bull"] else 0.0
        add(
            "Bear < base < bull (1 = true)",
            "=IF(AND(Bear<Base,Base<Bull),1,0)",
            ordered,
            1,
            1.0,
            0,
            "int",
        )
        if d.prediction:
            for key in ("bear", "base", "bull"):
                logged = _num(d.prediction.get(key))
                if logged is not None:
                    add(
                        f"{key.capitalize()} case vs the official prediction's logged figure",
                        f"={key.capitalize()}",
                        float(rng[key]),
                        round(logged, 4),
                        round(logged, 4),
                        0.006,
                        "money",
                    )
    factors = n.get("factors") or []
    if factors:
        total = sum(float(f.get("weight") or 0) for f in factors)
        add(
            "Score factor weights add up to 100%",
            "=SUM(FactorWeights)",
            total,
            1,
            1.0,
            0.003,
            "pct",
        )
    ratings = v.get("peer_ratings") or {}
    if ratings.get("slices") and ratings.get("total"):
        counted = float(sum(int(s.get("count") or 0) for s in ratings["slices"]))
        total = int(ratings["total"])
        add(
            "Peer ratings add up to the peer group",
            "=SUM(PeerRatingCounts)",
            counted,
            total,
            float(total),
            0,
            "int",
        )
    claims = v.get("claims") or {}
    if claims.get("slices") and claims.get("total"):
        counted = float(sum(int(s.get("count") or 0) for s in claims["slices"]))
        total = int(claims["total"])
        add(
            "Claims kept + removed = claims written",
            "=SUM(ClaimCounts)",
            counted,
            total,
            float(total),
            0,
            "int",
        )
    for m in v.get("metrics") or []:
        found = [_num(p.get("value")) for p in m.get("peers") or []]
        found = [x for x in found if x is not None]
        reported = _num(m.get("peer_median"))
        if found and reported is not None:
            ratio = METRIC_KINDS.get(m.get("name")) == "ratio"
            add(
                f"{m.get('label')}: peer median (formula) vs the report's",
                f"=PeerMedian_{m['name']}",
                statistics.median(found),
                f"=ReportPeerMedian_{m['name']}",
                reported,
                0.005 if ratio else 0.0005,
                "mult" if ratio else "pct",
            )
    h = d.history
    if h:
        ties = (
            ("revenue", "revenue", 1e6, "num", "Revenue"),
            ("operating_income", "ebit", 1e6, "num", "Operating income"),
            ("net_income", "net_income", 1e6, "num", "Net income"),
            ("operating_cash_flow", "operating_cash_flow", 1e6, "num", "Operating cash flow"),
            ("capital_spending", "capital_spending", 1e6, "num", "Capital spending"),
            ("diluted_eps", "diluted_eps", 1, "money", "Diluted EPS"),
        )
        for item, key, scale, kind, label in ties:
            fig, used = h.ltm.get(item), h.report_inputs.get(key)
            if fig is not None and used is not None:
                add(
                    f"{label}, last 12 months, = the figure the report's metrics used",
                    f"=LTM_{item}",
                    fig.value / scale,
                    round(used / scale, 4),
                    used / scale,
                    0.5 if scale > 1 else 0.005,
                    kind,
                )
    return checks


# --- Summary -------------------------------------------------------------------------------------


def _summary(b: _Book) -> None:
    d, n, v = b.d, b.d.numbers, b.d.views
    sub = f"Summary · company note made {day_text(d.made_on)} · US$ per share"
    ws = b.sheet("Summary", sub, {"B:B": 32, "C:C": 14, "D:D": 3, "E:J": 12, "K:K": 16}, 10)
    ws.insert_image(
        0,
        8,
        "mark.png",
        {
            "image_data": io.BytesIO(style.mark_png()),
            "x_scale": 0.11,
            "y_scale": 0.11,
            "x_offset": 60,
            "y_offset": 1,
        },
    )
    ws.set_row(4, 20)
    ws.merge_range(4, 1, 4, 10, _headline(d), b.f["headline"])
    status = f"Prices as of {day_text(d.price_day)}, in that day's shares." if d.price_day else ""
    if d.split_factor and abs(d.split_factor - 1) > 1e-9:
        status += f" The stock has split {d.split_factor:g}-for-1 since."
    if d.prediction:
        status += f" Official prediction {d.prediction['prediction_id']}."
    else:
        status += " Not an official prediction (only a company's first rating in 30 days is)."
    ws.merge_range(5, 1, 5, 10, status.strip(), b.f["muted"])

    b.section(ws, 7, 1, 2, "The call")
    rating = n.get("rating") or {}
    valid = [m.value for m in d.methods if m.value is not None]
    rows: list[tuple[str, str, Any, str]] = [
        ("Rating, vs peers over 12 months", "=Rating", rating.get("call"), "call"),
        (
            f"Score, percentile of {d.peer_count} peers" if d.peer_count else "Score, percentile",
            "=Score",
            (n.get("score") or {}).get("percentile"),
            "f_int",
        ),
        ("Price", "=Price", _num((n.get("price") or {}).get("value")), "f_money"),
        (
            "Estimated value (median of methods)",
            "=Value",
            statistics.median(valid) if valid else None,
            "f_money",
        ),
        ("12-month bear case", "=Bear", _num((n.get("range") or {}).get("bear")), "f_money"),
        ("12-month base case", "=Base", _num((n.get("range") or {}).get("base")), "f_money"),
        ("12-month bull case", "=Bull", _num((n.get("range") or {}).get("bull")), "f_money"),
        ("Upside to the base case", "=Base/Price-1", _upside(d), "f_pct"),
        (
            "Uncertainty",
            "=Uncertainty",
            str(rating.get("uncertainty") or "").capitalize() or None,
            "f_text_r",
        ),
    ]
    ws.set_row(8, 24)
    for i, (label, formula, cached, fmt) in enumerate(rows):
        ws.write(8 + i, 1, label, b.f["label"])
        if cached is None:
            ws.write(8 + i, 2, "n/a", b.f["na"])
        else:
            ws.write_formula(8 + i, 2, formula, b.f[fmt], cached)

    weekly = n.get("weekly") or []
    if weekly:
        first = 60
        ws.write(first - 1, 1, "Weekly closes, for the chart", b.f["small"])
        for i, w in enumerate(weekly):
            ws.write_datetime(
                first + i, 1, _dt(date.fromisoformat(str(w["date"]))), b.f["small_date"]
            )
            ws.write_number(first + i, 2, float(w["close"]), b.f["in_money"])
        chart = b.wb.add_chart({"type": "line"})
        chart.add_series(
            {
                "name": f"{d.ticker} weekly close",
                "categories": ["Summary", first, 1, first + len(weekly) - 1, 1],
                "values": ["Summary", first, 2, first + len(weekly) - 1, 2],
                "line": {"color": style.NAVY, "width": 2},
            }
        )
        _style_chart(chart, "Share price, past 12 months (US$)")
        closes = [float(w["close"]) for w in weekly]
        chart.set_x_axis(
            {
                **_axis(),
                "date_axis": True,
                "num_format": "mmm yy",
                "major_unit": 2,
                "major_unit_type": "months",
                "line": {"color": style.RULE},
            }
        )
        chart.set_y_axis(
            {
                **_axis(),
                "num_format": "$#,##0",
                "min": _round_down(min(closes) * 0.92),
                "max": _round_up(max(closes) * 1.06),
                "major_gridlines": {"visible": True, "line": {"color": style.GRID}},
                "line": {"none": True},
            }
        )
        chart.set_size({"width": 600, "height": 250})
        ws.insert_chart(7, 4, chart, {"x_offset": 4, "y_offset": 2})

    r = 19
    b.section(
        ws,
        r,
        1,
        10,
        "Key points: the first checked claim of each section, word for word",
        {10: "Notes"},
    )
    r += 1
    for section, claim in d.key_points():
        ws.write(r, 1, section.title, b.f["bold"])
        ws.merge_range(r, 2, r, 9, claim.text, b.f["wrap"])
        ws.write(r, 10, ", ".join(str(x) for x in claim.notes), b.f["small_wrap_r"])
        ws.set_row(r, 14 * max(1, -(-len(claim.text) // 115)) + 4)
        r += 1
    if not d.key_points():
        ws.write(r, 1, "No claim passed the checks in this report.", b.f["muted"])
        r += 1
    r += 1
    b.section(ws, r, 1, 2, "Red-flag checks")
    b.section(ws, r, 4, 10, "The economy when the report was made", {8: "Value", 10: "As of"})
    flags, econ = v.get("red_flags") or [], v.get("economy") or []
    for i in range(max(len(flags), len(econ))):
        row = r + 1 + i
        if i < len(flags):
            found = bool(flags[i].get("found"))
            ws.write(row, 1, flags[i].get("label"), b.f["label"])
            ws.write(
                row, 2, "Found" if found else "Clear", b.f["bad"] if found else b.f["in_text_r"]
            )
        if i < len(econ):
            ws.merge_range(row, 4, row, 7, econ[i].get("label"), b.f["label"])
            ws.write(row, 8, econ[i].get("value"), b.f["in_text_r"])
            ws.merge_range(row, 9, row, 10, econ[i].get("date"), b.f["in_text_r"])
    r += max(len(flags), len(econ)) + 2
    ws.set_row(r, 40)
    ws.merge_range(r, 1, r, 10, style.DISCLAIMER, b.f["muted_wrap"])
    ws.print_area(0, 0, r + 1, 10)
    ws.merge_range(
        r + 1,
        1,
        r + 1,
        10,
        "Blue: typed in from the filings or the saved report (point at one to see where it came from). "
        "Black: a formula. Nothing here recalculates the report or changes its rating.",
        b.f["small"],
    )
    ws.freeze_panes(3, 0)
    ws.activate()


def _round_down(x: float) -> float:
    step = 10 ** max(0, len(str(int(abs(x)))) - 2)
    return (x // step) * step


def _round_up(x: float) -> float:
    step = 10 ** max(0, len(str(int(abs(x)))) - 2)
    return -((-x) // step) * step


# --- Financials ----------------------------------------------------------------------------------

# (item or formula, label, flow or point, scale, number format). "§" starts a section.
FIN_ROWS: list[tuple[str, str, str, float, str]] = [
    ("§", "Income statement", "", 1, ""),
    ("revenue", "Revenue", "flow", 1e6, "num"),
    ("=growth:revenue", "Growth", "", 1, "pct"),
    ("cost_of_revenue", "Cost of revenue", "flow", 1e6, "num"),
    ("=gross", "Gross profit", "", 1, "num"),
    ("=margin:gross", "Gross margin", "", 1, "pct"),
    ("operating_income", "Operating income (EBIT)", "flow", 1e6, "num"),
    ("=margin:operating_income", "Operating margin", "", 1, "pct"),
    ("pretax_income", "Pretax income", "flow", 1e6, "num"),
    ("income_tax", "Income tax", "flow", 1e6, "num"),
    ("=taxrate", "Tax rate", "", 1, "pct"),
    ("net_income", "Net income", "flow", 1e6, "num"),
    ("=margin:net_income", "Net margin", "", 1, "pct"),
    ("diluted_eps", "Diluted EPS (US$)", "flow", 1, "money"),
    ("diluted_shares", "Diluted shares (m)", "point", 1e6, "num1"),
    ("§", "Cash flow", "", 1, ""),
    ("operating_cash_flow", "Operating cash flow", "flow", 1e6, "num"),
    ("capital_spending", "Capital spending", "flow", 1e6, "num"),
    ("=fcf", "Free cash flow", "", 1, "num"),
    ("=margin:fcf", "Free cash flow margin", "", 1, "pct"),
    ("depreciation_amortization", "Depreciation and amortization", "flow", 1e6, "num"),
    ("stock_based_pay", "Stock-based pay", "flow", 1e6, "num"),
    ("dividends_paid", "Dividends paid", "flow", 1e6, "num"),
    ("§", "Balance sheet, at period end", "", 1, ""),
    ("total_assets", "Total assets", "point", 1e6, "num"),
    ("total_equity", "Total equity", "point", 1e6, "num"),
    ("cash", "Cash and short-term investments", "point", 1e6, "num"),
    ("total_debt", "Total debt", "point", 1e6, "num"),
    ("=netdebt", "Net debt (debt less cash)", "", 1, "num"),
    ("=roe", "Return on average equity", "", 1, "pct"),
]
SUBTOTALS = ("=gross", "=fcf")


def _financials(b: _Book) -> None:
    d = b.d
    h = d.history
    sub = "Financials · US$ in millions, except per share · as filed with the SEC"
    ws = b.sheet("Financials", sub, {"B:B": 36, "C:F": 13, "G:G": 3}, 5)
    if h is None or not h.year_ends:
        ws.write(
            4,
            1,
            "The filings behind this report aren't in this computer's raw store, so its past years can't be shown.",
            b.f["muted"],
        )
        return
    years = h.year_ends
    cols = [2 + i for i in range(len(years))] + [2 + len(years)]  # the years, then LTM
    ltm_col = cols[-1]
    head = 4
    ws.write(head, 1, "US$ m", b.f["head_l"])
    for i, end in enumerate(years):
        ws.write(head, cols[i], f"FY{end.year}A", b.f["head"])
        ws.write(head + 1, cols[i], end.strftime("%b-%y"), b.f["sub"])
    ws.write(head, ltm_col, "LTM", b.f["head"])
    ws.write(head + 1, ltm_col, h.ltm_end.strftime("%b-%y") if h.ltm_end else "", b.f["sub"])
    r = head + 2
    where: dict[str, int] = {}
    values: dict[str, list[float | None]] = {}
    label_rows: dict[str, int] = {}
    for key, label, kind, scale, fmt in FIN_ROWS:
        if key == "§":
            r += 1
            b.section(ws, r, 1, ltm_col, label)
            r += 1
            continue
        if not key.startswith("="):
            figs = list(h.annual.get(key) or [None] * len(years)) + [h.ltm.get(key)]
            if all(f is None for f in figs):
                continue
            ws.write(r, 1, label, b.f["label"])
            vals: list[float | None] = []
            for i, fig in enumerate(figs):
                if fig is None:
                    ws.write(r, cols[i], "n/a", b.f["na"])
                    vals.append(None)
                    continue
                shown = fig.value / scale
                ws.write_number(r, cols[i], shown, b.f[f"in_{fmt}"])
                unit = "" if key in ("diluted_eps", "diluted_shares") else " US$"
                is_ltm = i == len(figs) - 1 and kind == "flow"
                b.note(ws, r, cols[i], _filed_note(d, fig, scale=scale, unit=unit, ltm=is_ltm))
                vals.append(shown)
            where[key], values[key], label_rows[label] = r, vals, r
            b.name(f"LTM_{key}", "Financials", r, ltm_col)
            r += 1
            continue
        found = _fin_formula(key, where, values, cols)
        if found is None:
            continue
        cells, cached = found
        italic = fmt == "pct"
        subtotal = key in SUBTOTALS
        ws.write(r, 1, label, b.f["indent" if italic else "total_label" if subtotal else "label"])
        prefix = "fi_" if italic else "tot_" if subtotal else "f_"
        for i, col in enumerate(cols):
            if cells[i] is None:
                ws.write_blank(r, col, None, b.f[f"{prefix}{fmt}"])
            else:
                ws.write_formula(r, col, cells[i], b.f[f"{prefix}{fmt}"], cached[i] or 0)
        if key in ("=gross", "=fcf", "=netdebt"):
            where[key[1:]], values[key[1:]] = r, cached
        label_rows[label] = r
        r += 1
    r += 1
    ws.merge_range(
        r,
        1,
        r + 1,
        ltm_col,
        "Blue figures are as filed with the SEC: point at one for the filing, the XBRL line and the "
        "exact value. Black rows are formulas. LTM is the last 12 months, the figures the report's "
        "metrics used (see the checks).",
        b.f["muted_wrap"],
    )
    ws.set_row(r, 15)
    ws.set_row(r + 1, 15)
    rev_row = where.get("revenue")
    # The margin line needs yearly values: a bank's operating margin has only its LTM.
    yearly = {k: v for k, v in values.items() if any(x is not None for x in v[: len(years)])}
    margin_label = "Operating margin" if "operating_income" in yearly else "Net margin"
    if rev_row is not None:
        cats = ["Financials", head, cols[0], head, cols[len(years) - 1]]
        chart = b.wb.add_chart({"type": "column"})
        chart.add_series(
            {
                "name": "Revenue (US$ m)",
                "categories": cats,
                "values": ["Financials", rev_row, cols[0], rev_row, cols[len(years) - 1]],
                "fill": {"color": style.NAVY},
                "gap": 90,
            }
        )
        if margin_label in label_rows:
            mrow = label_rows[margin_label]
            line = b.wb.add_chart({"type": "line"})
            line.add_series(
                {
                    "name": margin_label,
                    "categories": cats,
                    "values": ["Financials", mrow, cols[0], mrow, cols[len(years) - 1]],
                    "y2_axis": True,
                    "line": {"color": style.BEAR, "width": 2.25},
                    "marker": {
                        "type": "circle",
                        "size": 6,
                        "fill": {"color": style.BEAR},
                        "border": {"color": style.BEAR},
                    },
                }
            )
            chart.combine(line)
            line.set_y2_axis({**_axis(), "num_format": "0%", "min": 0, "line": {"none": True}})
        _style_chart(chart, f"Revenue and {margin_label.lower()} by fiscal year")
        chart.set_y_axis(
            {
                **_axis(),
                "num_format": "#,##0",
                "min": 0,
                "major_gridlines": {"visible": True, "line": {"color": style.GRID}},
                "line": {"none": True},
            }
        )
        chart.set_legend(
            {"position": "bottom", "font": {"name": "Arial", "size": 8, "color": style.GREY}}
        )
        chart.set_size({"width": 470, "height": 290})
        ws.insert_chart(4, ltm_col + 2, chart, {"x_offset": 6})
    ws.freeze_panes(head + 2, 2)


def _fin_formula(
    key: str, where: dict[str, int], values: dict[str, list[float | None]], cols: list[int]
):
    """One formula row's cells and cached values, or None when its inputs aren't shown."""
    n = len(cols)
    out: list[str | None] = [None] * n
    cached: list[float | None] = [None] * n

    def cell(item: str, i: int) -> str:
        return xl_rowcol_to_cell(where[item], cols[i])

    def have(*items: str) -> bool:
        return all(item in where for item in items)

    def ok(*vals: float | None) -> bool:
        return all(x is not None for x in vals)

    if key.startswith("=growth:"):
        item = key.split(":", 1)[1]
        if not have(item):
            return None
        for i in range(1, n - 1):  # fiscal years only: the LTM can overlap the last year
            a, z = values[item][i - 1], values[item][i]
            if ok(a, z) and a:
                out[i], cached[i] = f"={cell(item, i)}/{cell(item, i - 1)}-1", z / a - 1
        return out, cached
    if key.startswith("=margin:"):
        item = key.split(":", 1)[1]
        if not have(item, "revenue"):
            return None
        for i in range(n):
            a, rv = values[item][i], values["revenue"][i]
            if ok(a, rv) and rv:
                out[i], cached[i] = f"={cell(item, i)}/{cell('revenue', i)}", a / rv
        return out, cached
    pairs = {
        "=gross": ("revenue", "cost_of_revenue"),
        "=fcf": ("operating_cash_flow", "capital_spending"),
        "=netdebt": ("total_debt", "cash"),
    }
    if key in pairs:
        first, second = pairs[key]
        if not have(first, second):
            return None
        for i in range(n):
            a, z = values[first][i], values[second][i]
            if ok(a, z):
                out[i], cached[i] = f"={cell(first, i)}-{cell(second, i)}", a - z
        return out, cached
    if key == "=taxrate":
        if not have("income_tax", "pretax_income"):
            return None
        for i in range(n):
            t, p = values["income_tax"][i], values["pretax_income"][i]
            if ok(t, p) and p:
                out[i], cached[i] = f"={cell('income_tax', i)}/{cell('pretax_income', i)}", t / p
        return out, cached
    if key == "=roe":
        if not have("net_income", "total_equity"):
            return None
        for i in range(1, n - 1):
            ni, e0, e1 = (
                values["net_income"][i],
                values["total_equity"][i - 1],
                values["total_equity"][i],
            )
            if ok(ni, e0, e1) and (e0 + e1):
                out[i] = (
                    f"={cell('net_income', i)}/AVERAGE({cell('total_equity', i - 1)},"
                    f"{cell('total_equity', i)})"
                )
                cached[i] = ni / ((e0 + e1) / 2)
        return out, cached
    return None


# --- Valuation -----------------------------------------------------------------------------------


def _valuation(b: _Book) -> None:
    d, n, v = b.d, b.d.numbers, b.d.views
    ws = b.sheet(
        "Valuation",
        "Valuation · US$ per share",
        {"B:B": 40, "C:D": 13, "E:E": 50, "F:F": 3, "G:H": 12},
        4,
    )
    price = _num((n.get("price") or {}).get("value"))
    r = 4
    b.section(ws, r, 1, 4, "Value per share by method", {2: "US$", 3: "vs price"})
    r += 1
    first = r
    for m in d.methods:
        ws.write(r, 1, m.label, b.f["label"])
        if m.value is None:
            ws.write_blank(r, 2, None, b.f["in_money"])
            ws.write(r, 4, f"Not used: {m.note}" if m.note else "Not used", b.f["muted"])
        else:
            ws.write_number(r, 2, m.value, b.f["in_money"])
            b.note(
                ws,
                r,
                2,
                _report_note("Valuation section, method table", f"{m.code}: ${m.value:,.2f}"),
            )
            if price:
                ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["fi_pct"], m.value / price - 1)
            ws.write(r, 4, m.note or "", b.f["muted"])
        b.name(f"Method_{m.code}", "Valuation", r, 2)
        r += 1
    valid = [m for m in d.methods if m.value is not None]
    ws.write(r, 1, "Estimated value: median of the methods used", b.f["total_label"])
    if valid:
        med = statistics.median(m.value for m in valid)
        ws.write_formula(r, 2, f"=MEDIAN(C{first + 1}:C{r})", b.f["tot_money"], med)
        if price:
            ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["tot_pct"], med / price - 1)
    else:
        ws.write(r, 2, "n/a", b.f["na"])
    b.name("Value", "Valuation", r, 2)
    r += 1
    ws.write(r, 1, "The report's estimated value", b.f["indent"])
    reported = _num((n.get("estimate") or {}).get("value"))
    if reported is not None:
        ws.write_number(r, 2, reported, b.f["in_money"])
        b.note(ws, r, 2, _report_note("Valuation section", f"Estimated value: ${reported:,.2f}."))
    b.name("ReportValue", "Valuation", r, 2)
    r += 2

    b.section(ws, r, 1, 4, "Price and the 12-month range", {2: "US$", 3: "vs price"})
    r += 1
    ws.write(
        r, 1, f"Price, close on {day_text(d.price_day)}" if d.price_day else "Price", b.f["label"]
    )
    if price is not None:
        ws.write_number(r, 2, price, b.f["in_money"])
        when = f" on {day_text(d.price_day)}" if d.price_day else ""
        b.note(ws, r, 2, _report_note("Valuation section", f"Price: ${price:,.2f}{when}."))
    b.name("Price", "Valuation", r, 2)
    r += 1
    rng = n.get("range") or {}
    meaning = {
        "bear": "10th percentile of the 12-month spread",
        "base": "The price grown at the cost of equity less the dividend yield, plus a third of the gap to value",
        "bull": "90th percentile of the 12-month spread",
    }
    for key in ("bear", "base", "bull"):
        ws.write(r, 1, f"12-month {key} case", b.f["label"])
        val = _num(rng.get(key))
        if val is not None:
            ws.write_number(r, 2, val, b.f["in_money"])
            said = f"12-month range: bear ${rng['bear']:,.2f}, base ${rng['base']:,.2f}, bull ${rng['bull']:,.2f}."
            b.note(ws, r, 2, _report_note("Rating section", said))
            if price:
                ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["fi_pct"], val / price - 1)
        ws.write(r, 4, meaning[key], b.f["muted"])
        b.name(key.capitalize(), "Valuation", r, 2)
        r += 1
    r += 1
    b.section(ws, r, 1, 4, "The rating")
    r += 1
    rating = n.get("rating") or {}
    facts = [
        ("Rating, vs peers over 12 months", "Rating", rating.get("call"), "in_text_r"),
        (
            "Score, percentile of the peer group",
            "Score",
            (n.get("score") or {}).get("percentile"),
            "in_int",
        ),
        (
            "Uncertainty",
            "Uncertainty",
            str(rating.get("uncertainty") or "").capitalize() or None,
            "in_text_r",
        ),
        (
            "Value-gap percentile among valued peers",
            "GapPercentile",
            (n.get("estimate") or {}).get("gap_percentile"),
            "in_int",
        ),
    ]
    for label, name, val, fmt in facts:
        ws.write(r, 1, label, b.f["label"])
        if val is None:
            ws.write(r, 2, "n/a", b.f["na"])
        else:
            ws.write(r, 2, val, b.f[fmt])
            b.note(ws, r, 2, _report_note("Rating section"))
        b.name(name, "Valuation", r, 2)
        r += 1
    trig = n.get("triggers") or {}
    for side in ("buy", "sell"):
        ws.write(r, 1, f"{side.capitalize()} trigger", b.f["label"])
        at = _num(trig.get(side))
        if at is not None:
            ws.write_number(r, 2, at, b.f["in_money"])
        else:
            ws.merge_range(r, 2, r, 4, trig.get(f"{side}_text") or "n/a", b.f["in_text"])
        r += 1
    r += 1
    b.section(ws, r, 1, 4, "The peer group today, before red-flag caps", {2: "Companies"})
    r += 1
    first_rating = r
    for s in (v.get("peer_ratings") or {}).get("slices") or []:
        ws.write(r, 1, f"Rated {s.get('label')}", b.f["label"])
        ws.write_number(r, 2, int(s.get("count") or 0), b.f["in_int"])
        r += 1
    if r > first_rating:
        b.wb.define_name("PeerRatingCounts", f"='Valuation'!$C${first_rating + 1}:$C${r}")
    ws.write(r, 1, "Companies in the peer group", b.f["total_label"])
    ws.write_number(r, 2, int((v.get("peer_ratings") or {}).get("total") or 0), b.f["tot_int"])
    r = _assumptions(b, ws, r + 2)
    ws.print_area(0, 0, max(r, 26), 14)

    bars: list[tuple[str, float, str]] = [
        (m.label.split(" (")[0], float(m.value), style.NAVY) for m in valid
    ]
    if valid:
        bars.append(
            ("Estimated value", float(statistics.median(m.value for m in valid)), style.BULL)
        )
    for key, color in (("bear", style.BEAR), ("base", style.NAVY), ("bull", style.BULL)):
        if _num(rng.get(key)) is not None:
            bars.append((f"12-month {key}", float(rng[key]), color))
    if price is not None:
        bars.append(("Price today", price, style.GREY))
    if bars:
        top = 60
        ws.write(top - 1, 6, "Chart data", b.f["small"])
        for i, (label, val, _) in enumerate(bars):
            ws.write(top + i, 6, label, b.f["small"])
            ws.write_number(top + i, 7, val, b.f["in_money"])
        chart = b.wb.add_chart({"type": "bar"})
        chart.add_series(
            {
                "name": "US$ per share",
                "categories": ["Valuation", top, 6, top + len(bars) - 1, 6],
                "values": ["Valuation", top, 7, top + len(bars) - 1, 7],
                "points": [{"fill": {"color": c}} for _, _, c in bars],
                "data_labels": {
                    "value": True,
                    "num_format": "$#,##0.00",
                    "font": {"name": "Arial", "size": 8},
                },
                "gap": 60,
            }
        )
        _style_chart(chart, "Valuation range, US$ per share")
        chart.set_x_axis(
            {
                **_axis(),
                "num_format": "$#,##0",
                "min": 0,
                "major_gridlines": {"visible": True, "line": {"color": style.GRID}},
                "line": {"none": True},
            }
        )
        chart.set_y_axis({**_axis(), "reverse": True, "line": {"color": style.RULE}})
        chart.set_size({"width": 520, "height": 320})
        ws.insert_chart(4, 6, chart, {"x_offset": 6})
    ws.freeze_panes(3, 0)


SAVED_NOTE = "Saved with the run when the report was made."
NOT_SAVED = "Not saved for this report (made before 8 Nov 2026)."
# The saved method names, as the report's valuation table names them (`data.METHOD_LABELS`).
_METHOD_CODES = {"price_to_ffo": "P_FFO"}


def _assumption_rows(method: str, rules: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    """(saved key, label, format, what it is) for one method's saved details. The wording
    follows valuation/dcf.py, residual_income.py, multiples.py and financials.py; the numbers in
    it come from the rules saved with the run."""
    dcf = rules.get("dcf") or {}
    multiples = rules.get("multiples") or {}
    triggers = rules.get("triggers") or {}

    def pct(value: Any, default: str) -> str:
        return f"{value:.0%}" if isinstance(value, int | float) else default

    trim = pct(multiples.get("trim_share"), "a share")
    least = multiples.get("min_peers", "enough")
    if method == "dcf":
        spread = rules.get("cost_of_debt_max_spread")
        cap = f"{spread * 100:.0f} points" if isinstance(spread, int | float) else "a spread"
        gap = dcf.get("min_rate_over_terminal")
        below = f"{gap * 100:.0f} points" if isinstance(gap, int | float) else "a margin"
        terminal_cap = dcf.get("terminal_growth_cap")
        lower = f"{terminal_cap:.1%}" if isinstance(terminal_cap, int | float) else "the cap"
        return [
            (
                "growth",
                f"Revenue growth, years 1-{dcf.get('growth_years', 5)}",
                "pct",
                f"The {dcf.get('history_years', 3)}-year rate, floored at "
                f"{pct(dcf.get('growth_floor'), 'the floor')} and capped at the peers' "
                f"{dcf.get('growth_cap_percentile', 90)}th percentile; it fades to terminal "
                f"growth by year {dcf.get('years', 10)}",
            ),
            (
                "start_margin",
                "Operating margin today",
                "pct",
                "EBIT plus operating lease cost ÷ revenue",
            ),
            (
                "target_margin",
                f"Operating margin by year {dcf.get('margin_years', 5)}",
                "pct",
                "The peer median, reached in a straight line",
            ),
            (
                "sales_to_capital",
                "Sales to capital",
                "mult",
                "Peer median revenue ÷ invested capital; reinvestment is the revenue increase ÷ this",
            ),
            ("cost_of_equity", "Cost of equity", "pct", "From the stock's 12-month volatility"),
            (
                "cost_of_debt",
                "Cost of debt",
                "pct",
                f"Interest ÷ average debt, between the 10-year yield and the yield plus {cap}",
            ),
            (
                "debt_weight",
                "Debt weight",
                "pct",
                "Debt and leases ÷ (market value + debt and leases)",
            ),
            (
                "discount_rate",
                "Discount rate",
                "pct",
                "Cost of equity and after-tax cost of debt, by their weights",
            ),
            (
                "terminal_growth",
                "Terminal growth",
                "pct",
                f"The lower of {lower} and the 10-year yield, and at least {below} below the "
                "discount rate",
            ),
            (
                "terminal_share",
                "Terminal value, share of firm value",
                "pct",
                f"Above {pct(triggers.get('terminal_share'), 'the trigger')} adds a step of "
                "uncertainty",
            ),
        ]
    if method == "residual_income":
        years = (rules.get("residual_income") or {}).get("years", 10)
        return [
            (
                "book_value",
                "Book value today, US$ millions",
                "num",
                "Common equity, latest balance sheet",
            ),
            (
                "start_roe",
                "Return on equity today",
                "pct",
                "Net income to common ÷ average common equity, last 12 months",
            ),
            (
                "target_roe",
                f"Return on equity by year {years}",
                "pct",
                "The peer median, reached in a straight line",
            ),
            (
                "payout",
                "Payout",
                "pct",
                "Share of earnings paid out; book value grows by return on equity × the rest",
            ),
            ("cost_of_equity", "Cost of equity", "pct", "From the stock's 12-month volatility"),
        ]
    if method in ("multiples", "pe"):
        rows = [
            (
                "pe_multiple",
                "Peer P/E",
                "mult",
                f"Harmonic mean of the peers' P/E, top and bottom {trim} dropped",
            ),
            ("pe_peers", "Peers kept for P/E", "int", f"At least {least} needed"),
        ]
        if method == "multiples":
            rows += [
                (
                    "ev_ebit_multiple",
                    "Peer EV/EBIT",
                    "mult",
                    f"Harmonic mean of the peers' EV/EBIT, top and bottom {trim} dropped",
                ),
                ("ev_ebit_peers", "Peers kept for EV/EBIT", "int", f"At least {least} needed"),
            ]
        return rows
    if method == "price_to_ffo":
        return [
            (
                "ffo_multiple",
                "Peer price ÷ FFO",
                "mult",
                f"Harmonic mean of the REIT peers' price ÷ FFO, top and bottom {trim} dropped",
            ),
            ("reit_peers", "REIT peers kept", "int", f"At least {least} needed"),
            (
                "ffo_per_share",
                "FFO per share, US$",
                "money",
                "Net income + real-estate depreciation − gains on sales, ÷ shares",
            ),
        ]
    return []


def _range_rows(rules: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    rng = rules.get("range") or {}
    blend = rng.get("peer_volatility_blend")
    moved = f"{blend:.0%} of the way" if isinstance(blend, int | float) else "part of the way"
    years = rng.get("value_gap_years", 3)
    return [
        (
            "cost_of_equity",
            "Cost of equity",
            "pct",
            f"Base case: the price grown at this less the dividend yield, plus 1/{years} of the "
            "gap to value",
        ),
        ("dividend_yield", "Dividend yield", "pct", "Last 12 months' dividends ÷ price"),
        ("volatility", "Stock's 12-month volatility", "pct", "Annualized"),
        ("peer_median_volatility", "Peer median volatility", "pct", "The peer group's median"),
        (
            "blended_volatility",
            "Volatility used for the range",
            "pct",
            f"The stock's, moved {moved} to the peer median; bear and bull are its 10th and "
            "90th percentiles",
        ),
    ]


def _assumptions(b: _Book, ws, r: int) -> int:
    """Each method's saved assumptions and the range inputs, typed in blue. Returns the row
    after the section."""
    saved = b.d.assumptions
    b.section(ws, r, 1, 4, "Assumptions behind each method", {2: "Saved"})
    r += 1
    if not saved:
        ws.write(r, 1, NOT_SAVED, b.f["muted"])
        return r + 1
    rules = saved.get("rules") or {}

    def rows(details: dict[str, Any], spec: list[tuple[str, str, str, str]]) -> None:
        nonlocal r
        for key, label, kind, meaning in spec:
            ws.write(r, 1, label, b.f["label"])
            value = _num(details.get(key))
            if value is None:
                ws.write(r, 2, "n/a", b.f["na"])
            else:
                if key == "book_value":
                    value /= 1e6
                ws.write_number(r, 2, value, b.f[f"in_{kind}"])
                b.note(ws, r, 2, SAVED_NOTE)
            ws.write(r, 4, meaning, b.f["muted"])
            r += 1

    for m in saved.get("methods") or []:
        code = str(m.get("method") or "")
        label = LABELS.get(_METHOD_CODES.get(code, code.upper())) or code.replace("_", " ")
        ws.write(r, 1, label, b.f["bold"])
        details = m.get("details") or {}
        if not details:
            reason = m.get("reason")
            ws.write(r, 4, f"Not used: {reason}" if reason else "Not used", b.f["muted"])
            r += 1
            continue
        r += 1
        rows(details, _assumption_rows(code, rules))
    ws.write(r, 1, "12-month range", b.f["bold"])
    r += 1
    if saved.get("range"):
        rows(saved["range"], _range_rows(rules))
    else:
        ws.write(r, 1, "No range: the report has no estimated value", b.f["muted"])
        r += 1
    return r


# --- Peers ---------------------------------------------------------------------------------------


def _peers(b: _Book) -> None:
    d, n, v = b.d, b.d.numbers, b.d.views
    metrics = v.get("metrics") or []
    last = max(4, 3 + len(metrics) - 1 + 1)
    widths = {"B:B": 30, f"C:{xl_col_to_name(last)}": 13}
    ws = b.sheet(
        "Peers",
        "Peers · the score, key metrics and 1-year total return against the peer group",
        widths,
        last,
    )
    r = 4
    b.section(ws, r, 1, 3, "Score factors", {2: "Percentile", 3: "Weight"})
    r += 1
    ws.write(r, 1, "Score (percentile of the peer group)", b.f["bold"])
    score = (n.get("score") or {}).get("percentile")
    if score is not None:
        ws.write_formula(r, 2, "=Score", b.f["f_int"], score)
    r += 1
    factors = n.get("factors") or []
    first = r
    for f in factors:
        ws.write(r, 1, str(f.get("name") or "").capitalize(), b.f["label"])
        ws.write(r, 2, f.get("percentile"), b.f["in_int"])
        ws.write(r, 3, f.get("weight"), b.f["in_pct"])
        b.note(ws, r, 2, _report_note("Score section, factor table"))
        r += 1
    if factors:
        b.wb.define_name("FactorWeights", f"='Peers'!$D${first + 1}:$D${r}")
        ws.write(r, 1, "Total weight", b.f["total_label"])
        ws.write_formula(
            r,
            3,
            "=SUM(FactorWeights)",
            b.f["tot_pct"],
            sum(float(f.get("weight") or 0) for f in factors),
        )
        r += 1
    r += 1

    peers: dict[str, dict[str, Any]] = {}
    one_year = next((x for x in v.get("returns") or [] if x.get("years") == 1), None)
    for p in (one_year or {}).get("each_peer") or []:
        peers.setdefault(str(p.get("name")), {})["return"] = p.get("value")
    for m in metrics:
        for p in m.get("peers") or []:
            peers.setdefault(str(p.get("ticker")), {})[m["name"]] = p.get("value")
    you: dict[str, Any] = {"return": ((one_year or {}).get("company") or {}).get("value")}
    for m in metrics:
        you[m["name"]] = m.get("value")
    heads = {2: "1-year total return"} | {
        3 + i: str(m.get("label") or m.get("name")) for i, m in enumerate(metrics)
    }
    b.section(ws, r, 1, last, "Each company in the peer group")
    for col, text in heads.items():
        ws.write(r, col, text, b.f["section_wrap"])
    ws.set_row(r, 28)
    r += 1
    table_first = r
    others = sorted(peers, key=lambda t: -(_num(peers[t].get("return")) or -1e9))
    order = [(d.ticker, you, True)] + [(t, peers[t], False) for t in others]
    for ticker, vals, me in order:
        ws.write(
            r,
            1,
            f"{ticker} (this company)" if me else ticker,
            b.f["hi_text"] if me else b.f["label"],
        )
        ret = _num(vals.get("return"))
        if ret is not None:
            ws.write_number(r, 2, ret / 100, b.f["hi_pct"] if me else b.f["in_pct"])
        for i, m in enumerate(metrics):
            val = _num(vals.get(m["name"]))
            kind = "mult" if METRIC_KINDS.get(m.get("name")) == "ratio" else "pct"
            if val is not None:
                ws.write_number(r, 3 + i, val, b.f[f"hi_{kind}"] if me else b.f[f"in_{kind}"])
        r += 1
    ws.write(r, 1, "Peer median (formula, peers only)", b.f["total_label"])
    for col in range(2, 3 + len(metrics)):
        key = "return" if col == 2 else metrics[col - 3]["name"]
        kind = "mult" if col > 2 and METRIC_KINDS.get(key) == "ratio" else "pct"
        found = [_num(peers[t].get(key)) for t in others]
        found = [x / 100 if col == 2 else x for x in found if x is not None]
        letter = xl_col_to_name(col)
        ws.write_formula(
            r,
            col,
            f"=MEDIAN({letter}{table_first + 2}:{letter}{r})",
            b.f[f"tot_{kind}"],
            statistics.median(found) if found else 0,
        )
        if col > 2:
            b.name(f"PeerMedian_{key}", "Peers", r, col)
    r += 1
    ws.write(r, 1, "The report's figure for the peers", b.f["indent"])
    ret_peers = _num(((one_year or {}).get("peers") or {}).get("value"))
    if ret_peers is not None:
        ws.write_number(r, 2, ret_peers / 100, b.f["in_pct"])
        b.note(
            ws,
            r,
            2,
            _report_note(
                "Returns",
                "Peer group total return, each peer weighted the same: an average, not the median.",
            ),
        )
    for i, m in enumerate(metrics):
        med = _num(m.get("peer_median"))
        kind = "mult" if METRIC_KINDS.get(m.get("name")) == "ratio" else "pct"
        if med is not None:
            ws.write_number(r, 3 + i, med, b.f[f"in_{kind}"])
            b.note(ws, r, 3 + i, _report_note("Key metrics", str(m.get("readout") or "")))
        b.name(f"ReportPeerMedian_{m['name']}", "Peers", r, 3 + i)
    r += 1
    ws.write(r, 1, "Percentile: share of peers below this company", b.f["indent"])
    for i, m in enumerate(metrics):
        if m.get("percentile") is not None:
            ws.write_number(r, 3 + i, m["percentile"], b.f["in_int"])
    r += 2
    ws.merge_range(
        r,
        1,
        r,
        last,
        "Peer figures are as the report stored them. The report's 1-year peer return weights each peer the same, so it differs from the median.",
        b.f["small"],
    )
    ws.print_area(0, 0, r, last + 9)

    data = [(t, _num(vals.get("return"))) for t, vals, _ in order]
    data = sorted([(t, x) for t, x in data if x is not None], key=lambda p: p[1])
    if len(data) > 1:
        top = 200
        ws.write(top - 1, 1, "Chart data", b.f["small"])
        for i, (t, x) in enumerate(data):
            ws.write(top + i, 1, t, b.f["small"])
            ws.write_number(top + i, 2, x / 100, b.f["in_pct"])
        chart = b.wb.add_chart({"type": "bar"})
        chart.add_series(
            {
                "name": "1-year total return",
                "categories": ["Peers", top, 1, top + len(data) - 1, 1],
                "values": ["Peers", top, 2, top + len(data) - 1, 2],
                "points": [
                    {
                        "fill": {"color": style.BEAR if t == d.ticker else "#9FB3CF"},
                        "border": {"none": True},
                    }
                    for t, _ in data
                ],
                "gap": 35,
            }
        )
        _style_chart(chart, f"1-year total return: {d.ticker} (orange) and each peer")
        chart.set_x_axis(
            {
                **_axis(),
                "num_format": "0%",
                "major_gridlines": {"visible": True, "line": {"color": style.GRID}},
                "line": {"none": True},
            }
        )
        chart.set_y_axis(
            {
                "num_font": {"name": "Arial", "size": 7, "color": style.GREY},
                "line": {"color": style.RULE},
            }
        )
        chart.set_size({"width": 420, "height": max(320, 13 * len(data) + 90)})
        ws.insert_chart(4, last + 2, chart)
    ws.freeze_panes(3, 2)


# --- Sources & checks ----------------------------------------------------------------------------


def _sources(b: _Book) -> None:
    d = b.d
    sub = "Sources & checks · each check recomputes a figure from others in this file"
    # Row 4 holds "All checks" and its light in B and C, so the label starts in D.
    ws = b.sheet("Sources & checks", sub, {"B:B": 60, "C:F": 13, "G:G": 10}, 6, label_col=3)
    ws.write(3, 1, "All checks", b.f["bold"])
    master = b.master()
    first = 6
    count = len(b.checks)
    ws.write_formula(
        3,
        2,
        f'=IF(COUNTIF(G{first + 1}:G{first + max(1, count)},"OK")={count},"OK","CHECK")',
        b.f["ok" if master == "OK" else "bad"],
        master,
    )
    b.section(
        ws,
        5,
        1,
        6,
        "Checks",
        {2: "This file", 3: "Should be", 4: "Difference", 5: "Tolerance", 6: "Result"},
    )
    r = first
    for c in b.checks:
        kind = c["kind"]
        ws.write(r, 1, c["what"], b.f["label"])
        ws.write_formula(r, 2, c["formula"], b.f[f"f_{kind}"], c["cached"])
        if isinstance(c["against"], str):
            ws.write_formula(r, 3, c["against"], b.f[f"f_{kind}"], c["against_value"])
        else:
            ws.write_number(r, 3, c["against"], b.f[f"in_{kind}"])
        ws.write_formula(
            r, 4, f"=C{r + 1}-D{r + 1}", b.f[f"f_{kind}"], c["cached"] - c["against_value"]
        )
        ws.write_number(r, 5, c["tol"], b.f[f"f_{kind}"])
        ws.write_formula(
            r,
            6,
            f'=IF(ABS(E{r + 1})<=F{r + 1}+0.000000001,"OK","CHECK")',
            b.f["ok" if c["result"] == "OK" else "bad"],
            c["result"],
        )
        r += 1
    if not b.checks:
        ws.write(r, 1, "Nothing to check: this report stores no valuation or score.", b.f["muted"])
        r += 1
    claims = d.views.get("claims") or {}
    if claims.get("slices"):
        r += 1
        b.section(ws, r, 1, 2, "Claims", {2: "Count"})
        r += 1
        ws.write(r, 1, "Claims written", b.f["label"])
        ws.write_number(r, 2, int(claims.get("total") or 0), b.f["in_int"])
        r += 1
        start = r
        for s in claims["slices"]:
            ws.write(r, 1, str(s.get("readout") or s.get("label")), b.f["label"])
            ws.write_number(r, 2, int(s.get("count") or 0), b.f["in_int"])
            r += 1
        b.wb.define_name("ClaimCounts", f"='Sources & checks'!$C${start + 1}:$C${r}")
    r += 1
    b.section(ws, r, 1, 6, "The filings the report read")
    r += 1
    for f in d.filings:
        ws.write(r, 1, f"{f.get('form')}, accession {f.get('accession')}", b.f["in_text"])
        if str(f.get("url") or "").startswith("https://"):
            ws.write_url(r, 2, str(f["url"]), b.f["url"], "Open on sec.gov")
        r += 1
    r += 1
    b.section(
        ws,
        r,
        1,
        6,
        "Numbered notes: each claim's source, the same numbers as the PDF and the deck",
        {6: "Link"},
    )
    r += 1
    for note in d.notes:
        quote = (
            f"“{note.quote}”" if note.quote else "The quoted passage is not stored for this report."
        )
        ws.write(r, 1, f"{note.number}.  {note.label} · {note.section}", b.f["bold"])
        if note.url:
            ws.write_url(
                r, 6, note.url, b.f["url"], "sec.gov" if "sec.gov" in note.url else "article"
            )
        ws.merge_range(r + 1, 1, r + 1, 5, quote, b.f["in_wrap"])
        ws.set_row(r + 1, 13 * max(1, min(40, -(-len(quote) // 115))) + 2)
        r += 2
    ws.freeze_panes(3, 0)


# --- charts --------------------------------------------------------------------------------------


def _axis() -> dict[str, Any]:
    return {"num_font": {"name": "Arial", "size": 8, "color": style.GREY}}


def _style_chart(chart, title: str) -> None:
    chart.set_title(
        {
            "name": title,
            "name_font": {"name": "Arial", "size": 10, "bold": True, "color": style.NAVY},
            "overlay": False,
        }
    )
    chart.set_legend({"none": True})
    chart.set_chartarea({"border": {"none": True}, "fill": {"color": "#FFFFFF"}})
    chart.set_plotarea({"border": {"none": True}})


# --- the workbook --------------------------------------------------------------------------------


def build(data: ExportData) -> bytes:
    """The workbook's bytes."""
    book = _Book(data)
    book.checks = _plan_checks(data)
    _summary(book)
    _financials(book)
    _valuation(book)
    _peers(book)
    _sources(book)
    book.wb.close()
    return book.out.getvalue()
