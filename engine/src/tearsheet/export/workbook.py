"""The Excel download (Option A, Liam's pick on 8 Nov 2026): the saved report's numbers in a
bank-style workbook. Nothing in it recalculates the report; the only formulas are the upside,
a few sums and the Checks, which can fail if a copied figure is wrong.

Bank conventions (research: reports/Bank style equity research templates.md): Arial 10,
gridlines off, navy header bands, units rows, figures copied from the report in blue, formulas
in black, links to other sheets in green, and a master check in row 1 of every sheet. The key
results have workbook names (Price, Value, Bear, Base, Bull, ...) so a later live model can
replace one cell rather than many.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Any

import xlsxwriter

from tearsheet.export import style
from tearsheet.export.data import LABEL, ExportData, day_text
from tearsheet.render import METRIC_KINDS

BLUE = "#0000FF"
GREEN = "#008000"
MONEY = "$#,##0.00_);($#,##0.00)"
PCT = "0.0%_);(0.0%)"
MULT = '0.0"x"'
INT = "#,##0"
SHEETS = (
    ("Cover", "The official call, what this file holds, and how to read it"),
    ("Summary", "The call and the key points, with their source notes"),
    ("Valuation", "Value per share by method, the estimated value and the 12-month range"),
    ("Score and metrics", "The score's factors, key metrics against peer medians, red-flag checks"),
    ("Returns and peers", "Total returns, weekly closes and each peer's figures"),
    ("Economy", "The economic series the report cites"),
    ("Sources", "Every numbered note: the source, the quoted passage and the link"),
    ("Checks", "Checks that fail if a copied figure is wrong"),
)
LAST_COL = 7  # columns B..H hold the content


class _Book:
    """The workbook, its formats, and the cells the Checks tab reads."""

    def __init__(self, data: ExportData) -> None:
        self.data = data
        self.out = io.BytesIO()
        self.wb = xlsxwriter.Workbook(self.out, {"in_memory": True})
        self.wb.set_properties(
            {
                "title": f"{data.name} ({data.ticker}): Tearsheet report",
                "author": "Tearsheet Research",
                "comments": LABEL,
            }
        )
        self.wb.set_size(1500, 1000)
        self.f: dict[str, Any] = {}
        self.checks: list[dict[str, Any]] = []
        base = {"font_name": "Arial", "font_size": 10, "valign": "top"}

        def fmt(name: str, **kw: Any) -> None:
            self.f[name] = self.wb.add_format({**base, **kw})

        fmt("text")
        fmt("wrap", text_wrap=True)
        fmt("muted", font_color=style.GREY)
        fmt("muted_wrap", font_color=style.GREY, text_wrap=True)
        fmt("bold", bold=True)
        fmt("brand", bold=True, font_color=style.NAVY, font_size=9)
        fmt("rule", bg_color=style.SIGNATURE_FROM)
        fmt("rule2", bg_color=style.SIGNATURE_TO)
        fmt("title", bold=True, font_size=12, font_color=style.NAVY)
        fmt("name", bold=True, font_size=20, font_color=style.NAVY, valign="vcenter")
        fmt("headline", font_size=12)
        fmt("band", bold=True, font_color="#FFFFFF", bg_color=style.NAVY, text_wrap=True)
        fmt(
            "band_r",
            bold=True,
            font_color="#FFFFFF",
            bg_color=style.NAVY,
            align="right",
            text_wrap=True,
        )
        fmt("units", italic=True, font_color=style.GREY, bg_color=style.FILL)
        fmt("label", font_color=style.INK)
        fmt("total", bold=True, top=1)
        for kind, num in (("money", MONEY), ("pct", PCT), ("mult", MULT), ("int", INT)):
            fmt(f"in_{kind}", font_color=BLUE, num_format=num)
            fmt(f"calc_{kind}", num_format=num)
            fmt(f"link_{kind}", font_color=GREEN, num_format=num)
            fmt(f"total_{kind}", font_color=BLUE, num_format=num, bold=True, top=1)
        fmt("in_text", font_color=BLUE)
        fmt("in_wrap", font_color=BLUE, text_wrap=True)
        fmt("in_date", font_color=BLUE, num_format="d mmm yyyy", align="left")
        fmt("link_text", font_color=GREEN)
        fmt("link_text_r", font_color=GREEN, align="right")
        fmt("in_int_l", font_color=BLUE, num_format=INT, align="left")
        fmt("calc_text", align="center", bold=True)
        fmt("url", font_color=style.BULL, underline=1)
        fmt("box_label", font_color=style.GREY, left=1, left_color=style.NAVY)
        fmt("call", bold=True, font_size=16, font_color=style.NAVY)
        fmt("ok", bold=True, align="center", font_color="#006100", bg_color="#C6EFCE")
        fmt("bad", bold=True, align="center", font_color="#9C0006", bg_color="#FFC7CE")
        fmt("key_blue", font_color=BLUE)
        fmt("key_black")
        fmt("key_green", font_color=GREEN)
        fmt("note", font_size=8, font_color=style.GREY, text_wrap=True)

    # --- sheet scaffolding ------------------------------------------------------------------

    def sheet(
        self, name: str, subtitle: str, widths: dict[str, float] | None = None, title: bool = True
    ):
        ws = self.wb.add_worksheet(name)
        ws.hide_gridlines(2)
        ws.set_column("A:A", 2)
        ws.set_column("B:B", 34)
        ws.set_column("C:H", 15)
        for cols, width in (widths or {}).items():
            ws.set_column(cols, width)
        ws.set_default_row(15)
        ws.set_row(1, 4)
        # Row 1: the brand and the master check; row 2: the cyan "price line" rule.
        ws.write("B1", style.BRAND, self.f["brand"])
        ws.write("G1", "Checks", self.f["muted"])
        master = self.master_value()
        ws.write_formula(
            "H1", "=Checks!$C$4", self.f["ok"] if master == "OK" else self.f["bad"], master
        )
        for col in range(1, LAST_COL + 1):
            ws.write_blank(1, col, None, self.f["rule"] if col <= 3 else self.f["rule2"])
        if title:
            ws.write("B3", f"{name}: {self.data.name} ({self.data.ticker})", self.f["title"])
            ws.write("B4", subtitle, self.f["muted"])
        ws.set_landscape()
        ws.set_paper(1)
        ws.fit_to_pages(1, 0)
        ws.set_margins(left=0.5, right=0.5, top=0.6, bottom=0.6)
        ws.set_footer("&L&8Tearsheet Research · " + LABEL + "&R&8&A · page &P of &N")
        ws.freeze_panes(4, 0)
        return ws

    def band(self, ws, row: int, labels: list[str], text_cols: tuple[int, ...] = ()) -> None:
        """A navy header row. The first label and any in `text_cols` sit left; numbers' sit right."""
        for i, text in enumerate(labels):
            ws.write(
                row, 1 + i, text, self.f["band"] if (i == 0 or i in text_cols) else self.f["band_r"]
            )

    def units(self, ws, row: int, text: str, width: int = LAST_COL) -> None:
        ws.merge_range(row, 1, row, width, text, self.f["units"])

    def name(self, label: str, sheet: str, row: int, col: int) -> None:
        self.wb.define_name(label, f"='{sheet}'!${_col(col)}${row + 1}")

    def master_value(self) -> str:
        return "OK" if all(c["result"] in ("OK", "n/a") for c in self.checks) else "CHECK"


def _col(index: int) -> str:
    return xlsxwriter.utility.xl_col_to_name(index)


def _money_or_none(value: Any) -> float | None:
    return round(float(value), 2) if isinstance(value, int | float) else None


# --- the checks (worked out first, so every sheet's row 1 can show the result) ------------------


def _plan_checks(d: ExportData) -> list[dict[str, Any]]:
    n, v = d.numbers, d.views
    checks: list[dict[str, Any]] = []
    valid = [m.value for m in d.methods if m.value is not None]
    value = _money_or_none((n.get("estimate") or {}).get("value"))
    if valid and value is not None:
        ordered = sorted(valid)
        mid = len(ordered) // 2
        med = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
        checks.append(
            {
                "what": "The estimated value is the median of the methods used",
                "formula": "=MEDIAN("
                + ",".join(f"Method_{m.code}" for m in d.methods if m.value is not None)
                + ")",
                "cached": med,
                "against": "=Value",
                "against_value": value,
                "tol": 0.011,  # the stored values are rounded to the cent
                "kind": "money",
            }
        )
    rng = n.get("range") or {}
    if all(isinstance(rng.get(k), int | float) for k in ("bear", "base", "bull")):
        ok = rng["bear"] < rng["base"] < rng["bull"]
        checks.append(
            {
                "what": "Bear < base < bull",
                "formula": "=AND(Bear<Base,Base<Bull)",
                "cached": ok,
                "logical": True,
            }
        )
        if d.prediction:
            for key, title in (("bear", "Bear"), ("base", "Base"), ("bull", "Bull")):
                logged = d.prediction.get(key)
                if isinstance(logged, int | float):
                    checks.append(
                        {
                            "what": f"{title} case equals the official prediction's",
                            "formula": f"={title}",
                            "cached": rng[key],
                            "against": round(float(logged), 4),
                            "against_value": round(float(logged), 4),
                            "against_typed": True,
                            "tol": 0.006,
                            "kind": "money",
                        }
                    )
    factors = n.get("factors") or []
    if factors:
        total = sum(float(f.get("weight") or 0) for f in factors)
        checks.append(
            {
                "what": "The score's factor weights add up to 100%",
                "formula": "=SUM(FactorWeights)",
                "cached": total,
                "against": 1,
                "against_value": 1.0,
                "against_typed": True,
                "tol": 0.003,
                "kind": "pct",
            }
        )
    ratings = v.get("peer_ratings") or {}
    if ratings.get("slices") and ratings.get("total"):
        counted = sum(int(s.get("count") or 0) for s in ratings["slices"])
        checks.append(
            {
                "what": "Peer ratings add up to the group",
                "formula": "=SUM(PeerRatingCounts)",
                "cached": counted,
                "against": "=PeerGroupSize",
                "against_value": int(ratings["total"]),
                "tol": 0,
                "kind": "int",
            }
        )
    claims = v.get("claims") or {}
    if claims.get("slices") and claims.get("total"):
        counted = sum(int(s.get("count") or 0) for s in claims["slices"])
        checks.append(
            {
                "what": "Claims kept and removed add up to the claims written",
                "formula": "=SUM(ClaimCounts)",
                "cached": counted,
                "against": "=ClaimsWritten",
                "against_value": int(claims["total"]),
                "tol": 0,
                "kind": "int",
            }
        )
    for c in checks:
        if c.get("logical"):
            c["result"] = "OK" if c["cached"] else "CHECK"
        else:
            c["result"] = (
                "OK"
                if abs(float(c["cached"]) - float(c["against_value"])) <= c["tol"] + 1e-9
                else "CHECK"
            )
    return checks


# --- the sheets ---------------------------------------------------------------------------------


def _cover(b: _Book) -> None:
    d, n = b.data, b.data.numbers
    ws = b.sheet(
        "Cover", SHEETS[0][1], {"B:B": 30, "C:C": 22, "D:D": 4, "E:E": 18, "F:H": 24}, title=False
    )
    ws.set_row(5, 34)
    ws.insert_image(
        "B6",
        "mark.png",
        {
            "image_data": io.BytesIO(style.mark_png()),
            "x_scale": 0.16,
            "y_scale": 0.16,
            "x_offset": 0,
            "y_offset": 2,
        },
    )
    ws.merge_range("C6:H6", f"{d.name} ({d.ticker})", b.f["name"])
    ws.merge_range("B7:H7", _headline(d), b.f["headline"])
    made = f"Report made {day_text(d.made_on)}."
    priced = f" Prices as of {day_text(d.price_day)}, in that day's shares." if d.price_day else ""
    ws.merge_range("B8:H8", made + priced + _split_text(d), b.f["muted"])

    b.band(ws, 9, ["OFFICIAL CALL", ""])
    rows = [
        (
            "Rating (vs peers, 12 months)",
            "=Rating",
            "link_text_r",
            (n.get("rating") or {}).get("call"),
        ),
        (
            "Score (percentile of peer group)",
            "=Score",
            "link_int",
            (n.get("score") or {}).get("percentile"),
        ),
        ("Price", "=Price", "link_money", (n.get("price") or {}).get("value")),
        ("Estimated value", "=Value", "link_money", (n.get("estimate") or {}).get("value")),
        ("12-month bear case", "=Bear", "link_money", (n.get("range") or {}).get("bear")),
        ("12-month base case", "=Base", "link_money", (n.get("range") or {}).get("base")),
        ("12-month bull case", "=Bull", "link_money", (n.get("range") or {}).get("bull")),
        ("Upside to the base case", "=Upside", "link_pct", _upside(d)),
        ("Uncertainty", "=Uncertainty", "link_text_r", (n.get("rating") or {}).get("uncertainty")),
    ]
    r = 10
    for label, formula, fmt, cached in rows:
        ws.write(r, 1, label, b.f["box_label"])
        if cached is None:
            ws.write(r, 2, "not stored for this report", b.f["muted"])
        else:
            shown = str(cached).capitalize() if label == "Uncertainty" else cached
            ws.write_formula(r, 2, formula, b.f[fmt], shown)
        r += 1
    ws.write(r, 1, "Official prediction", b.f["box_label"])
    if d.prediction:
        ws.write(r, 2, f"Yes: {d.prediction['prediction_id']}", b.f["in_text"])
        ws.write(r + 1, 1, "", b.f["box_label"])
        ws.write(r + 1, 2, "Graded at 3, 6 and 12 months.", b.f["muted"])
    else:
        ws.write(r, 2, "No: this report was not logged as an official prediction.", b.f["in_text"])
        ws.write(r + 1, 1, "", b.f["box_label"])
        ws.write(r + 1, 2, "Only a first rating in 30 days is.", b.f["muted"])
    ws.write(r + 2, 1, "Checks", b.f["box_label"])
    master = b.master_value()
    ws.write_formula(r + 2, 2, "=Checks!$C$4", b.f["ok"] if master == "OK" else b.f["bad"], master)

    # Right-hand side: the colour key and the contents.
    ws.write(9, 4, "HOW TO READ THIS FILE", b.f["band"])
    for col in range(5, LAST_COL + 1):
        ws.write_blank(9, col, None, b.f["band"])
    key = [
        ("key_blue", "Blue", "Copied from the saved report."),
        ("key_black", "Black", "A formula on this sheet."),
        ("key_green", "Green", "A link to a figure on another sheet."),
    ]
    for i, (fmt, word, meaning) in enumerate(key):
        ws.write(10 + i, 4, word, b.f[fmt])
        ws.merge_range(10 + i, 5, 10 + i, LAST_COL, meaning, b.f["text"])
    ws.merge_range(
        13,
        4,
        14,
        LAST_COL,
        "Nothing in this file recalculates the report or changes its rating. Editing a figure changes only that cell.",
        b.f["muted_wrap"],
    )
    ws.write(16, 4, "WHAT'S IN THIS FILE", b.f["band"])
    for col in range(5, LAST_COL + 1):
        ws.write_blank(16, col, None, b.f["band"])
    for i, (sheet, what) in enumerate(SHEETS[1:]):
        ws.write_url(17 + i, 4, f"internal:'{sheet}'!A1", b.f["url"], sheet)
        ws.merge_range(17 + i, 5, 17 + i, LAST_COL, what, b.f["text"])

    # The run behind the report, and the label.
    r = 26
    b.band(ws, r, ["ABOUT THIS REPORT", ""])
    about = [
        ("Report id", d.report_id),
        ("Run id", d.run_id),
        ("Report type", d.mode_note or d.mode),
        ("Engine version", d.engine_version),
        ("Method code version", str(d.method_code_version)),
        (
            "Methodology hash",
            d.methodology_hash[:16] + "…" if len(d.methodology_hash) > 16 else d.methodology_hash,
        ),
        ("Narrative checked by", ", ".join(d.checks) + (f" ({d.skeptic})" if d.skeptic else "")),
    ]
    for i, (label, value) in enumerate(about):
        ws.write(r + 1 + i, 1, label, b.f["muted"])
        ws.merge_range(r + 1 + i, 2, r + 1 + i, LAST_COL, value, b.f["text"])
    r += len(about) + 2
    ws.set_row(r, 54)
    ws.merge_range(r, 1, r, LAST_COL, style.DISCLAIMER, b.f["muted_wrap"])
    ws.activate()


def _summary(b: _Book) -> None:
    d, n, v = b.data, b.data.numbers, b.data.views
    ws = b.sheet("Summary", SHEETS[1][1], {"B:B": 30, "C:C": 16, "D:D": 90, "E:E": 12})
    b.band(ws, 5, ["THE CALL", "", ""])
    b.units(ws, 6, "US$ per share, except where shown", 3)
    rating = n.get("rating") or {}
    rows: list[tuple[str, str, Any, str]] = [
        ("Rating", "Rating", rating.get("call"), "in_text"),
        ("Capped by a red flag", "Capped", "Yes" if rating.get("capped") else "No", "in_text"),
        ("Score (percentile)", "Score", (n.get("score") or {}).get("percentile"), "in_int"),
        (
            "Uncertainty",
            "Uncertainty",
            str(rating.get("uncertainty") or "").capitalize() or None,
            "in_text",
        ),
        ("Price", "Price", (n.get("price") or {}).get("value"), "in_money"),
        ("Price date", "PriceDate", d.price_day, "in_date"),
        ("Estimated value", "Value", (n.get("estimate") or {}).get("value"), "in_money"),
        ("12-month bear case", "Bear", (n.get("range") or {}).get("bear"), "in_money"),
        ("12-month base case", "Base", (n.get("range") or {}).get("base"), "in_money"),
        ("12-month bull case", "Bull", (n.get("range") or {}).get("bull"), "in_money"),
        (
            "Companies in the peer group",
            "PeerGroupSize",
            (v.get("peer_ratings") or {}).get("total"),
            "in_int",
        ),
    ]
    r = 7
    for label, name, value, fmt in rows:
        ws.write(r, 1, label, b.f["label"])
        if value is None:
            ws.write(r, 2, "not stored", b.f["muted"])
        elif isinstance(value, date):
            ws.write_datetime(r, 2, _dt(value), b.f[fmt])
        else:
            ws.write(r, 2, value, b.f[fmt])
        b.name(name, "Summary", r, 2)
        r += 1
    ws.write(r, 1, "Upside to the base case", b.f["label"])
    up = _upside(d)
    if up is None:
        ws.write(r, 2, "not stored", b.f["muted"])
    else:
        ws.write_formula(r, 2, "=Base/Price-1", b.f["calc_pct"], up)
    b.name("Upside", "Summary", r, 2)
    r += 2
    b.band(ws, r, ["KEY POINTS", "", "", "NOTES"])
    ws.write(
        r + 1,
        1,
        "The first claim of each section that passed every check, word for word.",
        b.f["muted"],
    )
    r += 2
    for section, claim in d.key_points():
        ws.write(r, 1, section.title, b.f["bold"])
        ws.merge_range(r, 2, r, 3, claim.text, b.f["in_wrap"])
        ws.write(r, 4, ", ".join(str(x) for x in claim.notes), b.f["muted"])
        ws.set_row(r, 15 * max(1, -(-len(claim.text) // 110)))
        r += 1
    if not d.key_points():
        ws.write(r, 1, "No claim passed the checks in this report.", b.f["muted"])


def _valuation(b: _Book) -> None:
    d, n, v = b.data, b.data.numbers, b.data.views
    ws = b.sheet("Valuation", SHEETS[2][1], {"B:B": 44, "C:C": 16, "D:D": 16, "E:E": 80})
    b.band(ws, 5, ["VALUE PER SHARE BY METHOD", "US$", "vs price", "NOTE"], text_cols=(3,))
    b.units(ws, 6, "US$ per share. A method not used shows why.", 4)
    r = 7
    price = (n.get("price") or {}).get("value")
    for m in d.methods:
        ws.write(r, 1, m.label, b.f["label"])
        if m.value is None:
            ws.write_blank(r, 2, None, b.f["in_money"])
            ws.write(r, 3, "", b.f["text"])
        else:
            ws.write(r, 2, m.value, b.f["in_money"])
            if isinstance(price, int | float):
                ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["calc_pct"], m.value / price - 1)
        ws.write(r, 4, m.note or "", b.f["muted"])
        b.name(f"Method_{m.code}", "Valuation", r, 2)
        r += 1
    if not d.methods:
        ws.write(r, 1, "No valuation is stored for this report.", b.f["muted"])
        r += 1
    value = (n.get("estimate") or {}).get("value")
    ws.write(r, 1, "Estimated value (median of the methods used)", b.f["total"])
    if value is not None:
        ws.write_formula(r, 2, "=Value", b.f["link_money"], value)
        if isinstance(price, int | float):
            ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["calc_pct"], value / price - 1)
    r += 2

    b.band(ws, r, ["12-MONTH RANGE", "US$", "vs price", "WHAT IT MEANS"], text_cols=(3,))
    rng = n.get("range") or {}
    meaning = {
        "Bear": "10th percentile of the 12-month spread",
        "Base": "50th percentile: price grown at the cost of equity less the dividend yield, plus a third of the gap to value",
        "Bull": "90th percentile of the 12-month spread",
    }
    r += 1
    for title in ("Bear", "Base", "Bull"):
        ws.write(r, 1, f"{title} case", b.f["label"])
        val = rng.get(title.lower())
        if isinstance(val, int | float):
            ws.write_formula(r, 2, f"={title}", b.f["link_money"], val)
            if isinstance(price, int | float):
                ws.write_formula(r, 3, f"=C{r + 1}/Price-1", b.f["calc_pct"], val / price - 1)
        else:
            ws.write(r, 2, "not stored", b.f["muted"])
        ws.write(r, 4, meaning[title], b.f["muted"])
        r += 1
    ws.write(r, 1, "Price", b.f["label"])
    if isinstance(price, int | float):
        ws.write_formula(r, 2, "=Price", b.f["link_money"], price)
    ws.write(r, 4, f"Close on {day_text(d.price_day)}" if d.price_day else "", b.f["muted"])
    r += 2

    b.band(ws, r, ["PEER GROUP TODAY", "Companies", "", ""])
    r += 1
    ratings = (v.get("peer_ratings") or {}).get("slices") or []
    first = r
    for s in ratings:
        ws.write(r, 1, f"Rated {s.get('label')}", b.f["label"])
        ws.write(r, 2, int(s.get("count") or 0), b.f["in_int"])
        r += 1
    if ratings:
        b.wb.define_name("PeerRatingCounts", f"='Valuation'!$C${first + 1}:$C${r}")
        ws.write(r, 1, "Before red-flag caps, as the report counts them.", b.f["muted"])
        r += 1
    gap = (n.get("estimate") or {}).get("gap_percentile")
    if gap is not None:
        ws.write(r, 1, "Gap percentile among valued peers", b.f["label"])
        ws.write(r, 2, gap, b.f["in_int"])
        r += 1
    r += 1
    b.band(ws, r, ["TRIGGERS", "", "", ""])
    r += 1
    trig = n.get("triggers") or {}
    for side in ("buy", "sell"):
        ws.write(r, 1, f"{side.capitalize()} trigger", b.f["label"])
        price_at = trig.get(side)
        if isinstance(price_at, int | float):
            ws.write(r, 2, price_at, b.f["in_money"])
        else:
            ws.merge_range(r, 2, r, 4, trig.get(f"{side}_text") or "not stored", b.f["in_text"])
        r += 1
    section = d.section("valuation")
    if section and section.paragraphs:
        r += 1
        b.band(ws, r, ["THE REPORT'S VALUATION LINES", "", "", ""])
        for p in section.paragraphs:
            r += 1
            ws.merge_range(r, 1, r, 4, p, b.f["in_text"])


def _score(b: _Book) -> None:
    d, n, v = b.data, b.data.numbers, b.data.views
    ws = b.sheet("Score and metrics", SHEETS[3][1], {"B:B": 34, "C:F": 15, "G:G": 60})
    b.band(ws, 5, ["SCORE FACTORS", "Percentile", "Weight", ""])
    r = 6
    ws.write(r, 1, "Score (percentile of the peer group)", b.f["total"])
    score = (n.get("score") or {}).get("percentile")
    if score is not None:
        ws.write_formula(r, 2, "=Score", b.f["link_int"], score)
    r += 1
    factors = n.get("factors") or []
    first = r
    for f in factors:
        ws.write(r, 1, str(f.get("name") or "").capitalize(), b.f["label"])
        ws.write(r, 2, f.get("percentile"), b.f["in_int"])
        ws.write(r, 3, f.get("weight"), b.f["in_pct"])
        r += 1
    if factors:
        b.wb.define_name("FactorWeights", f"='Score and metrics'!$D${first + 1}:$D${r}")
        ws.write(r, 1, "Total weight", b.f["total"])
        ws.write_formula(
            r,
            3,
            "=SUM(FactorWeights)",
            b.f["calc_pct"],
            sum(float(f.get("weight") or 0) for f in factors),
        )
        r += 1
    else:
        ws.write(r, 1, "No score is stored for this report.", b.f["muted"])
        r += 1
    r += 1
    b.band(
        ws,
        r,
        ["KEY METRICS", d.ticker, "Peer median", "Percentile", "", "WHAT IT IS"],
        text_cols=(5,),
    )
    r += 1
    for m in v.get("metrics") or []:
        kind = "mult" if METRIC_KINDS.get(m.get("name")) == "ratio" else "pct"
        ws.write(r, 1, m.get("label"), b.f["label"])
        for col, key in ((2, "value"), (3, "peer_median")):
            val = m.get(key)
            if isinstance(val, int | float):
                ws.write(r, col, val, b.f[f"in_{kind}"])
            else:
                ws.write(r, col, "n/a", b.f["muted"])
        ws.write(r, 4, m.get("percentile"), b.f["in_int"])
        ws.write(r, 6, m.get("readout") or "", b.f["muted"])
        r += 1
    r += 1
    b.band(ws, r, ["RED-FLAG CHECKS", "Found?", "", "", "", ""])
    r += 1
    for flag in v.get("red_flags") or []:
        ws.write(r, 1, flag.get("label"), b.f["label"])
        found = bool(flag.get("found"))
        ws.write(r, 2, "Found" if found else "Clear", b.f["bad"] if found else b.f["in_text"])
        r += 1
    if v.get("red_flags_readout"):
        ws.merge_range(r, 1, r, 6, v["red_flags_readout"], b.f["muted"])


def _returns(b: _Book) -> None:
    d, v = b.data, b.data.views
    ws = b.sheet("Returns and peers", SHEETS[4][1], {"B:B": 26, "C:F": 16, "G:G": 14, "H:H": 12})
    b.band(ws, 5, ["TOTAL RETURN", d.ticker, "Peer group", "S&P 500", "", "", ""])
    b.units(ws, 6, "Total return with dividends; the peer group weights each peer the same")
    r = 7
    for row in v.get("returns") or []:
        years = row.get("years")
        ws.write(r, 1, f"Past {years} year{'s' if years != 1 else ''}", b.f["label"])
        for col, key in ((2, "company"), (3, "peers"), (4, "spy")):
            cell = row.get(key) or {}
            val = cell.get("value")
            ws.write(
                r,
                col,
                val / 100 if isinstance(val, int | float) else "n/a",
                b.f["in_pct"] if isinstance(val, int | float) else b.f["muted"],
            )
        r += 1
    r += 1
    # Each peer: one row per ticker, its 1-year return and its key metrics.
    peers: dict[str, dict[str, Any]] = {}
    one_year = next((row for row in v.get("returns") or [] if row.get("years") == 1), None)
    for p in (one_year or {}).get("each_peer") or []:
        peers.setdefault(str(p.get("name")), {})["return"] = p.get("value")
    metrics = v.get("metrics") or []
    for m in metrics:
        for p in m.get("peers") or []:
            peers.setdefault(str(p.get("ticker")), {})[m["name"]] = p.get("value")
    heads = ["PEERS", "1-year return"] + [m.get("label") or m.get("name") for m in metrics]
    b.band(ws, r, heads[:LAST_COL])
    ws.set_row(r, 28)
    r += 1
    for ticker in sorted(peers):
        ws.write(r, 1, ticker, b.f["label"])
        ret = peers[ticker].get("return")
        ws.write(r, 2, ret / 100 if isinstance(ret, int | float) else "", b.f["in_pct"])
        for i, m in enumerate(metrics[: LAST_COL - 2]):
            val = peers[ticker].get(m["name"])
            kind = "mult" if METRIC_KINDS.get(m.get("name")) == "ratio" else "pct"
            if isinstance(val, int | float):
                ws.write(r, 3 + i, val, b.f[f"in_{kind}"])
        r += 1
    if not peers:
        ws.write(r, 1, "No peer figures are stored for this report.", b.f["muted"])
        r += 1
    # Weekly closes and a chart of them, to the right.
    weekly = d.numbers.get("weekly") or []
    if weekly:
        ws.write(5, 6, "WEEK", b.f["band"])
        ws.write(5, 7, "US$", b.f["band_r"])
        start = 7
        for i, w in enumerate(weekly):
            ws.write_datetime(start + i, 6, _dt(date.fromisoformat(str(w["date"]))), b.f["in_date"])
            ws.write(start + i, 7, w["close"], b.f["in_money"])
        chart = b.wb.add_chart({"type": "line"})
        chart.add_series(
            {
                "name": f"{d.ticker} weekly close",
                "categories": ["Returns and peers", start, 6, start + len(weekly) - 1, 6],
                "values": ["Returns and peers", start, 7, start + len(weekly) - 1, 7],
                "line": {"color": style.NAVY, "width": 1.75},
            }
        )
        chart.set_title(
            {
                "name": f"{d.ticker} share price, past 12 months (US$)",
                "name_font": {"name": "Arial", "size": 10, "bold": True, "color": style.NAVY},
            }
        )
        chart.set_legend({"none": True})
        chart.set_x_axis(
            {
                "date_axis": True,
                "num_format": "mmm yy",
                "num_font": {"name": "Arial", "size": 8, "color": style.GREY},
                "line": {"color": style.RULE},
            }
        )
        chart.set_y_axis(
            {
                "num_format": "$#,##0",
                "num_font": {"name": "Arial", "size": 8, "color": style.GREY},
                "major_gridlines": {"visible": True, "line": {"color": style.GRID}},
                "line": {"none": True},
            }
        )
        chart.set_chartarea({"border": {"none": True}})
        chart.set_size({"width": 620, "height": 300})
        ws.insert_chart(r + 2, 1, chart)


def _economy(b: _Book) -> None:
    d = b.data
    ws = b.sheet("Economy", SHEETS[5][1], {"B:B": 34, "C:C": 22, "D:D": 14, "E:E": 16})
    b.band(ws, 5, ["SERIES", "FRED code", "Value", "As of"], text_cols=(1, 2, 3))
    r = 6
    for e in d.views.get("economy") or []:
        ws.write(r, 1, e.get("label"), b.f["label"])
        ws.write(r, 2, e.get("series"), b.f["muted"])
        ws.write(r, 3, e.get("value"), b.f["in_text"])
        ws.write(r, 4, e.get("date"), b.f["in_text"])
        r += 1
    if r == 6:
        ws.write(r, 1, "No economic series are stored for this report.", b.f["muted"])
        r += 1
    ws.write(
        r + 1,
        1,
        "Source: FRED, Federal Reserve Bank of St. Louis, as the report cites it.",
        b.f["muted"],
    )


def _sources(b: _Book) -> None:
    d = b.data
    ws = b.sheet("Sources", SHEETS[6][1], {"B:B": 6, "C:C": 24, "D:D": 18, "E:E": 90, "F:F": 18})
    ws.write(5, 1, "NOTE", b.f["band"])
    for col, text in ((2, "SOURCE"), (3, "SECTION"), (4, "QUOTED PASSAGE"), (5, "LINK")):
        ws.write(5, col, text, b.f["band"])
    for col in (6, 7):
        ws.write_blank(5, col, None, b.f["band"])
    r = 6
    for note in d.notes:
        ws.write(r, 1, note.number, b.f["in_int_l"])
        ws.write(r, 2, note.label, b.f["in_text"])
        ws.write(r, 3, note.section, b.f["muted"])
        quote = (
            f"“{note.quote}”" if note.quote else "The quoted passage is not stored for this report."
        )
        ws.write(r, 4, quote, b.f["in_wrap"])
        ws.set_row(r, 13 * max(1, min(40, -(-len(quote) // 98))))
        if note.url:
            ws.write_url(
                r,
                5,
                note.url,
                b.f["url"],
                "Open on sec.gov" if "sec.gov" in note.url else "Open the article",
            )
        r += 1
    if not d.notes:
        ws.write(r, 1, "No claim in this report cites a source.", b.f["muted"])
    ws.freeze_panes(6, 0)


def _checks(b: _Book) -> None:
    ws = b.sheet("Checks", SHEETS[7][1], {"B:B": 52, "C:F": 15, "G:G": 12})
    ws.write("B4", "All checks", b.f["bold"])
    master = b.master_value()
    first, last = 7, 7 + max(0, len(b.checks) - 1)
    ws.write_formula(
        "C4",
        f'=IF(COUNTIF(G{first + 1}:G{last + 1},"CHECK")=0,"OK","CHECK")',
        b.f["ok"] if master == "OK" else b.f["bad"],
        master,
    )
    b.band(ws, 6, ["CHECK", "This file", "Should equal", "Difference", "Tolerance", "Result"])
    r = first
    for c in b.checks:
        ws.write(r, 1, c["what"], b.f["label"])
        if c.get("logical"):
            ws.write_formula(r, 2, c["formula"], b.f["calc_text"], bool(c["cached"]))
            ws.write(r, 3, True, b.f["calc_text"])
            ws.write_formula(
                r,
                6,
                f'=IF(C{r + 1}=D{r + 1},"OK","CHECK")',
                b.f["ok"] if c["result"] == "OK" else b.f["bad"],
                c["result"],
            )
        else:
            kind = c["kind"]
            ws.write_formula(r, 2, c["formula"], b.f[f"calc_{kind}"], c["cached"])
            if c.get("against_typed"):
                ws.write(r, 3, c["against"], b.f[f"in_{kind}"])
            else:
                ws.write_formula(r, 3, c["against"], b.f[f"link_{kind}"], c["against_value"])
            ws.write_formula(
                r,
                4,
                f"=C{r + 1}-D{r + 1}",
                b.f[f"calc_{kind}"],
                float(c["cached"]) - float(c["against_value"]),
            )
            ws.write(r, 5, c["tol"], b.f[f"calc_{kind}"])
            ws.write_formula(
                r,
                6,
                f'=IF(ABS(E{r + 1})<=F{r + 1}+0.000000001,"OK","CHECK")',
                b.f["ok"] if c["result"] == "OK" else b.f["bad"],
                c["result"],
            )
        r += 1
    if not b.checks:
        ws.write(r, 1, "Nothing to check: this report stores no valuation or score.", b.f["muted"])
    ws.merge_range(
        r + 1,
        1,
        r + 2,
        6,
        "Each check recomputes a figure from others in this file. A CHECK means a figure was copied wrong; please report it.",
        b.f["muted_wrap"],
    )
    # The claim counts, for the last check.
    claims = b.data.views.get("claims") or {}
    if claims.get("slices"):
        r += 4
        b.band(ws, r, ["CLAIMS", "Count"])
        ws.write(r + 1, 1, "Claims written", b.f["label"])
        ws.write(r + 1, 2, int(claims.get("total") or 0), b.f["in_int"])
        b.name("ClaimsWritten", "Checks", r + 1, 2)
        start = r + 2
        for i, s in enumerate(claims["slices"]):
            ws.write(start + i, 1, s.get("label"), b.f["label"])
            ws.write(start + i, 2, int(s.get("count") or 0), b.f["in_int"])
        b.wb.define_name(
            "ClaimCounts", f"='Checks'!$C${start + 1}:$C${start + len(claims['slices'])}"
        )


# --- helpers ---------------------------------------------------------------------------------------


def _dt(day: date):
    from datetime import datetime

    return datetime(day.year, day.month, day.day)


def _upside(d: ExportData) -> float | None:
    base = (d.numbers.get("range") or {}).get("base")
    price = (d.numbers.get("price") or {}).get("value")
    if isinstance(base, int | float) and isinstance(price, int | float) and price:
        return base / price - 1
    return None


def _split_text(d: ExportData) -> str:
    if d.split_factor and abs(d.split_factor - 1) > 1e-9:
        return f" The stock has split {d.split_factor:g}-for-1 since; divide these prices by {d.split_factor:g} to compare with today's."
    return ""


def _headline(d: ExportData) -> str:
    """The code-written headline: the call and its numbers, never AI text."""
    n = d.numbers
    rating = (n.get("rating") or {}).get("call")
    base = (n.get("range") or {}).get("base")
    up = _upside(d)
    unc = (n.get("rating") or {}).get("uncertainty")
    if not rating:
        return "No rating is stored for this report."
    parts = [f"{rating}"]
    if isinstance(base, int | float) and d.price_day and up is not None:
        horizon = date(d.price_day.year + 1, d.price_day.month, 1)
        parts.append(
            f"base case ${base:,.2f} by {horizon:%b %Y}, {abs(up):.1%} {'above' if up >= 0 else 'below'} the price"
        )
    text = ": ".join(parts[:1]) + (": " + parts[1] if len(parts) > 1 else "")
    if unc:
        text += f", with {unc} uncertainty"
    return text


def build(data: ExportData) -> bytes:
    """The workbook's bytes."""
    book = _Book(data)
    book.checks = _plan_checks(data)
    _cover(book)
    _summary(book)
    _valuation(book)
    _score(book)
    _returns(book)
    _economy(book)
    _sources(book)
    _checks(book)
    book.wb.close()
    return book.out.getvalue()
