"""Filling placeholders and rendering the HTML (design items 31 and 32)."""

from __future__ import annotations

import math
import re
from datetime import date, timedelta
from html import unescape
from html.parser import HTMLParser

import pytest

from tearsheet.render import PlaceholderValue, fill, format_value, open_link, render_html
from tests.test_report_numbers import TABLES


@pytest.mark.parametrize(
    ("kind", "value", "text"),
    [
        ("percent", 0.1234, "12.3%"),
        ("percent", -0.051, "-5.1%"),
        ("ratio", 14.234, "14.2×"),
        ("price", 1234.5, "$1,234.50"),
        ("amount", 3.44e9, "$3.4 billion"),
        ("amount", 2.5e12, "$2,500.0 billion"),
        ("amount", 340.26e6, "$340.3 million"),
        ("count", 1234567, "1,234,567"),
        ("date", date(2026, 10, 3), "3 Oct 2026"),
    ],
)
def test_formats(kind, value, text):
    assert format_value(kind, value) == text


def test_fill_uses_only_the_call_list():
    allowed = {
        "metric:operating_margin": PlaceholderValue("metric:operating_margin", "percent", 0.25)
    }
    assert fill("Margin was {{metric:operating_margin}}.", allowed) == ("Margin was 25.0%.", None)
    text, reason = fill("Margin was {{metric:roe}}.", allowed)
    assert text is None and reason == "unknown placeholder"


def report(sentence_text: str) -> dict:
    return {
        "company": "Example <Co>",
        "ticker": "EXM",
        "run_at": "2026-11-05",
        "mode_note": "",
        "sections": [
            {
                "key": "business",
                "number": 4,
                "title": "The business",
                "paragraphs": [],
                "sentences": [
                    {
                        "id": "business.1",
                        "text": sentence_text,
                        "citations": [
                            {
                                "id": "acc#Item_1#p1@1",
                                "text": "Cited <b>paragraph</b>",
                                "url": "https://www.sec.gov/Archives/edgar/data/1/1/acc-index.htm",
                            }
                        ],
                        "note": None,
                    }
                ],
            }
        ],
        "removed": [],
        "direction_split": {},
        "checks": ["numeric guard", "citation check"],
        "skeptic": "not run in the thin slice",
        "cuts": None,
        "methodology": [],
        "filings": [
            {
                "form": "10-K",
                "accession": "acc",
                "url": "https://www.sec.gov/Archives/edgar/data/1/1/acc-index.htm",
            }
        ],
    }


def test_html_and_script_from_the_ai_come_out_as_plain_text():
    html = render_html(
        report('<script>alert(1)</script> <a href="javascript:alert(1)">x</a>'), mode="file"
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert 'href="javascript:' not in html
    assert "Example &lt;Co&gt;" in html
    assert "Cited &lt;b&gt;paragraph&lt;/b&gt;" in html


def numbers() -> dict:
    """A full numbers dict, as report_numbers.numbers_for gives it."""
    return {
        "rating": {"call": "Hold", "capped": True, "uncertainty": "very high"},
        "score": {"percentile": 74},
        "range": {"bear": 130.16, "base": 233.70, "bull": 419.62},
        "price": {"value": 200.13, "date": "4 Nov 2026"},
        "estimate": {"value": 236.36, "gap_percentile": 82},
        "triggers": {
            "buy": 263.73,
            "sell": None,
            "buy_text": "$263.73",
            "sell_text": "not reachable by price alone",
        },
        "factors": [
            {"name": "profitability", "percentile": 93, "weight": 0.3},
            {"name": "momentum", "percentile": 35, "weight": 0.25},
            {"name": "balance sheet", "percentile": 76, "weight": 0.075},
        ],
        "methods": [
            {"method": "DCF", "value": 115.24},
            {"method": "RESIDUAL_INCOME", "value": 546.10},
            {"method": "MULTIPLES", "value": 236.36},
        ],
        "returns_12m": {"company": -3.0, "peers": 45.2, "spy": 13.4},
        "peer_ratings": {"Buy": 8, "Hold": 26, "Sell": 7},
        "economy": [
            {
                "series": "UNRATE",
                "label": "Unemployment rate",
                "value": "4.2%",
                "date": "1 Sep 2026",
            },
            {
                "series": "DGS10",
                "label": "10-year Treasury yield",
                "value": "4.9%",
                "date": "4 Nov 2026",
            },
        ],
        "metrics": [
            {
                "name": "operating_margin",
                "label": "Operating margin",
                "value": 0.652,
                "peer_median": 0.283,
                "percentile": 95,
            },
            {
                "name": "interest_coverage",
                "label": "Interest coverage",
                "value": 425.8,
                "peer_median": 14.0,
                "percentile": 94,
            },
        ],
        "weekly": [
            {"date": (date(2025, 11, 14) + timedelta(weeks=i)).isoformat(), "close": 180.0 + i}
            for i in range(52)
        ],
        "claims": {"kept": 41, "removed": 12},
        "red_flags": ["risk_factor_change"],
    }


def hrefs(html: str) -> list[str]:
    return re.findall(r'href="([^"]+)"', html)


def test_the_page_has_its_own_content_security_policy_and_only_safe_links():
    html = render_html(report("Plain sentence."), mode="app", numbers=numbers())
    assert "default-src 'none'; style-src 'unsafe-inline'; img-src data:" in html
    for href in hrefs(html):
        assert href.startswith(("https://", "tearsheet://", "about:srcdoc#")), href
    assert "tearsheet://flag/business.1" in html
    assert "tearsheet://reread/acc" in html
    # Same-page links name the srcdoc document: a bare "#" would resolve against the app's address.
    assert "about:srcdoc#summary" in hrefs(html) and "about:srcdoc#full" in hrefs(html)
    assert not [h for h in hrefs(html) if h.startswith("#")]


def test_file_mode_shows_claim_ids_and_accessions_without_app_links():
    html = render_html(report("Plain sentence."), mode="file", numbers=numbers())
    assert "tearsheet://" not in html
    assert "business.1" in html
    assert "acc" in html
    same_page = [h for h in hrefs(html) if not h.startswith("https://")]
    assert "#summary" in same_page and "#full" in same_page
    assert all(h.startswith("#") for h in same_page), same_page
    assert "about:srcdoc" not in html


def test_view_and_column_options():
    r = report("Plain sentence.")
    assert 'data-view="summary"' in render_html(r, mode="app")
    assert 'data-view="full"' in render_html(r, mode="app", view="full")
    both = render_html(r, mode="app", numbers=numbers())
    assert 'id="numbers"' in both and 'id="summary"' in both and 'id="full"' in both
    text = render_html(r, mode="app", column="text", numbers=numbers())
    assert 'id="numbers"' not in text and 'id="summary"' in text and 'id="full"' in text
    only_numbers = render_html(r, mode="app", column="numbers", numbers=numbers())
    assert 'id="numbers"' in only_numbers
    assert 'id="summary"' not in only_numbers and 'id="full"' not in only_numbers
    # The file is read without the app: both columns, stacked, with the Full view open.
    file = render_html(r, mode="file", view="summary", column="text", numbers=numbers())
    assert 'data-view="full"' in file and 'id="numbers"' in file and 'id="summary"' in file
    for bad in ({"view": "huge"}, {"column": "left"}):
        with pytest.raises(ValueError):
            render_html(r, mode="app", **bad)


def key_tiles(html: str) -> str:
    """The narrow window's row of key-number tiles, up to the text column's view switch."""
    start = html.index('id="keys"')
    return html[start : html.index('class="tbar"', start)]


def test_narrow_adds_key_tiles():
    r = report("Plain sentence.")
    html = render_html(r, mode="app", column="text", narrow=True, numbers=numbers())
    keys = key_tiles(html)
    assert keys.count('class="kt"') == 5
    # The rating and score, price, estimated value, range, and the past year.
    for text in ("Hold", "74", "Price, 4 Nov", "$200.13", "$236.36", "$130 to $420", "−3.0%"):
        assert text in keys, text
    assert 'id="numbers"' not in html and "Plain sentence." in html
    # Only above the text on its own, in the app: not in a wide window, not beside the chart's
    # numbers, and not in a file.
    for other in (
        {"mode": "app", "column": "text"},
        {"mode": "app", "column": "both", "narrow": True},
        {"mode": "app", "column": "numbers", "narrow": True},
        {"mode": "file", "column": "text", "narrow": True},
    ):
        assert 'id="keys"' not in render_html(r, numbers=numbers(), **other), other
    # A report saved before the numbers were stored: each tile says so.
    for n in ({key: None for key in numbers()}, None):
        gaps = key_tiles(render_html(r, mode="app", column="text", narrow=True, numbers=n))
        assert gaps.count('class="kt"') == 5 and gaps.count("not stored") == 5


def test_the_numbers_column_and_the_summary_are_drawn_from_the_numbers():
    html = render_html(report("Plain sentence."), mode="app", numbers=numbers())
    assert html.count("<svg") >= 5  # score ring, price path, methods, two rings
    assert "$263.73" in html and "$236.36" in html and "$200.13" in html
    assert "74th percentile" in html  # the code-written call line
    assert "65.2%" in html and "425.8×" in html  # metrics formatted by kind
    assert "Plain sentence." in html  # the first surviving claim of each section
    assert "not stored for this report" not in html.lower()


def test_old_report_renders_with_gaps():
    gaps = {key: None for key in numbers()}
    for n in (gaps, None):
        html = render_html(report("Plain sentence."), mode="app", numbers=n)
        assert html.lower().count("not stored for this report") >= 9  # one per panel
        assert "Plain sentence." in html
        assert "Buy trigger" not in html  # no trigger line is made up


def test_numbers_are_drawn_not_injected():
    evil = '<script>alert(1)</script>"'
    n = numbers()
    n["rating"]["uncertainty"] = evil
    n["price"]["date"] = evil
    n["triggers"]["sell_text"] = evil
    n["factors"][0]["name"] = evil
    n["methods"][0]["method"] = evil
    n["economy"][0]["label"] = evil
    n["economy"][0]["value"] = evil
    n["metrics"][0]["label"] = evil
    n["red_flags"] = [evil]
    html = render_html(report("Plain sentence."), mode="app", numbers=n)
    assert "<script" not in html
    assert "&lt;script&gt;" in html
    assert html.count("<svg") >= 5  # the charts are still drawn
    # A readout names the factor, so its label carries the evil name too, escaped.
    labels = re.findall(r'aria-label="([^"]*)"', html)
    assert any("&lt;script&gt;" in label for label in labels)
    assert not [label for label in labels if "<" in label]
    tiles = key_tiles(
        render_html(report("Plain sentence."), mode="app", column="text", narrow=True, numbers=n)
    )
    assert "<script" not in tiles and "&lt;script&gt;" in tiles  # the price tile's date


def test_no_script_tags_anywhere():
    for mode in ("app", "file"):
        for view in ("summary", "full"):
            for n in (numbers(), None):
                for column, narrow in (("both", False), ("text", True)):
                    html = render_html(
                        report("Plain sentence."),
                        mode=mode,
                        view=view,
                        column=column,
                        narrow=narrow,
                        numbers=n,
                    )
                    assert "<script" not in html.lower()


def test_auto_layout_holds_both_columns_and_names_its_side():
    r = report("Plain sentence.")
    for side in ("text", "numbers"):
        html = render_html(r, mode="app", column="auto", side=side, numbers=numbers())
        # Both columns are in the document: the frame's width decides what shows, in CSS.
        assert 'id="numbers"' in html and 'id="summary"' in html and 'id="full"' in html
        assert f'class="mode-app col-auto side-{side}"' in html
        assert "@media (max-width: 859px)" in html
    with pytest.raises(ValueError):
        render_html(r, mode="app", column="auto", side="left")


def test_auto_layout_keeps_the_key_strip_for_a_narrow_window_only():
    r = report("Plain sentence.")
    narrow = render_html(r, mode="app", column="auto", narrow=True, numbers=numbers())
    assert key_tiles(narrow).count('class="kt"') == 5
    wide = render_html(r, mode="app", column="auto", numbers=numbers())
    assert 'id="keys"' not in wide


def test_still_render_has_no_entrance_motion():
    r = report("Plain sentence.")
    assert "@keyframes rise" in render_html(r, mode="app", column="auto", numbers=numbers())
    still = render_html(r, mode="app", column="auto", motion=False, numbers=numbers())
    assert "@keyframes" not in still and "Plain sentence." in still


def test_a_file_keeps_both_columns_whatever_is_asked():
    file = render_html(
        report("Plain sentence."), mode="file", column="auto", side="numbers", numbers=numbers()
    )
    assert 'class="mode-file col-both side-text"' in file
    assert 'id="numbers"' in file and 'id="summary"' in file


def test_a_narrow_window_keeps_one_column_at_any_frame_width():
    """A window under about 1,100 px shows the text with the key tiles, whatever the frame's
    width: the one-column rules hold without the 860 px media query."""
    r = report("Plain sentence.")
    narrow = render_html(r, mode="app", column="auto", narrow=True, numbers=numbers())
    assert 'class="mode-app col-auto side-text narrow"' in narrow
    css = narrow[: narrow.index("</style>")]
    outside = re.sub(r"@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", css)
    assert ".col-auto.narrow.side-text .nums" in outside
    wide = render_html(r, mode="app", column="auto", numbers=numbers())
    assert 'class="mode-app col-auto side-text"' in wide


def _range_chart(html: str) -> str:
    start = html.index("Past year and the 12-month range")
    return html[start : html.index("</svg>", start)]


def test_the_12_month_range_is_three_straight_labelled_lines():
    """Bull in green, bear in red and base dotted, each a straight line from today's price to its
    target a year out, over a light fill, and each named with its price and its move from
    today's $200.13."""
    svg = _range_chart(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    for cls in ("ch-bull", "ch-base", "ch-bear"):
        assert re.search(
            rf'<line class="{cls}" x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+"', svg
        ), cls
    fill = re.search(r'<polygon class="ch-fan" points="([^"]+)"', svg)
    assert fill and len(fill.group(1).split()) == 3  # a triangle: today, the bull and the bear
    for text in ("Bull", "$419.62", "+110%", "Base", "$233.70", "+17%", "Bear", "$130.16", "−35%"):
        assert text in svg, text


def test_a_stored_price_of_0_still_opens_the_report():
    """A move from today's price can't be worked out from a price of 0. The range still shows
    its three cases with their prices, and leaves out the move under each."""
    n = numbers()
    n["price"]["value"] = 0
    for column, narrow in (("both", False), ("auto", True)):
        html = render_html(
            report("Plain sentence."), mode="app", column=column, narrow=narrow, numbers=n
        )
        svg = _range_chart(html)
        for text in ("Bull", "$419.62", "Base", "$233.70", "Bear", "$130.16"):
            assert text in svg, text
        assert not re.search(r"[+−]\d+%</text>", svg)


def test_open_link():
    assert open_link("metrics", "operating_margin") == "tearsheet://open/metrics/operating_margin"
    assert open_link("table-valuation", 2) == "tearsheet://open/table-valuation/2"
    assert open_link("flags", "<x>") == "tearsheet://open/flags"
    assert open_link("flags") == "tearsheet://open/flags"
    assert open_link("nope") is None
    assert open_link("table-Bad Key") is None


# --- Readouts and links to the bigger views ---------------------------------------------------

OPEN_LINK = re.compile(
    r"^tearsheet://open/(price|factors|metrics|methods|returns|flags|economy|rings"
    r"|table-[a-z_]{1,32})(/[A-Za-z0-9_.-]{1,64})?$"
)
WORDING = (
    "Profitability: 93rd percentile. Better than 93 of 100 peers. Counts for 30% of the score.",
    "Operating margin: 65.2%. The peer median is 28.3%. 95% of peers are below EXM.",
    "Bull case: $419.62 in 12 months, 110% above today’s $200.13. The top of the range, its 90th"
    " percentile.",
    "Close on 14 Nov 2025: $180.00, 10% below today’s $200.13.",
    "Score: 74th percentile. Better than 74 of 100 peers on the weighted factors.",
    "1 of 4 checks found a red flag. Any one caps the rating at Hold.",
    "Buy: 8 of 41 companies in the group, rated before red-flag caps.",
)
TABLE_ROW_WORDING = "Profitability: percentile 93, weight used 30.0%."


def with_score_table(r: dict) -> dict:
    """The report with a Full-report section that holds the stored score table."""
    r["sections"].append(
        {
            "key": "score",
            "number": 2,
            "title": "Score",
            "paragraphs": [],
            "table": TABLES["score"],
            "sentences": [],
        }
    )
    return r


def style_of(html: str) -> str:
    css = html[html.index("<style>") + len("<style>") : html.index("</style>")]
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def css_rules(css: str) -> list[tuple[str, str]]:
    """Each innermost rule as (selector, declarations), inside an @media block or not."""
    return [(m.group(1).strip(), m.group(2)) for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css)]


def media_block(css: str, query: str) -> str:
    """The inside of the @media block for `query`, however deeply its rules nest."""
    start = css.index("{", css.index(f"@media {query}")) + 1
    depth = 1
    for at in range(start, len(css)):
        depth += {"{": 1, "}": -1}.get(css[at], 0)
        if depth == 0:
            return css[start:at]
    raise AssertionError(query)


def names_readout(selector: str) -> bool:
    return bool(re.search(r"\.ro\b", selector))


def test_every_item_links_to_its_bigger_view():
    html = render_html(with_score_table(report("Plain sentence.")), mode="app", numbers=numbers())
    links = [h for h in hrefs(html) if h.startswith("tearsheet://open/")]
    for link in links:
        assert OPEN_LINK.match(link), link
    opened = {link.removeprefix("tearsheet://open/") for link in links}
    expected = {
        "factors/0",
        "factors/1",
        "factors/2",
        "metrics/operating_margin",
        "metrics/interest_coverage",
        "methods/DCF",
        "methods/RESIDUAL_INCOME",
        "methods/MULTIPLES",
        "returns/company",
        "returns/peers",
        "returns/spy",
        "flags/restatement",
        "flags/material_weakness",
        "flags/going_concern",
        "flags/risk_factor_change",
        "economy/UNRATE",
        "economy/DGS10",
        "rings/buy",
        "rings/hold",
        "rings/sell",
        "rings/kept",
        "rings/removed",
        "price",
        "factors",  # the score ring
        "table-score/0",
        "table-score/1",
    }
    assert not expected - opened, expected - opened


def test_readouts_use_the_fixed_wording():
    page = unescape(
        render_html(with_score_table(report("Plain sentence.")), mode="app", numbers=numbers())
    )
    for text in (*WORDING, TABLE_ROW_WORDING):
        assert text in page, text
    assert "Point at a row to read it; click it to open the table bigger." in page


def test_the_past_year_has_a_readout_for_each_week_and_each_case():
    page = unescape(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    assert page.count("Close on ") == 52
    for case in ("Bull case:", "Base case:", "Bear case:"):
        assert page.count(case) == 1, case


def test_a_file_keeps_readouts_by_focus_without_app_links():
    html = render_html(with_score_table(report("Plain sentence.")), mode="file", numbers=numbers())
    assert "tearsheet://" not in html
    hot = re.findall(r'<[a-z]+ class="hot[^>]*>', html)
    assert hot
    for tag in hot:
        assert 'tabindex="0"' in tag and "href=" not in tag, tag
    page = unescape(html)
    for text in (*WORDING, TABLE_ROW_WORDING):
        assert text in page, text
    assert "Point at a row to read it." in page and "click it" not in page


def test_printing_hides_the_readouts():
    css = style_of(render_html(with_score_table(report("Plain sentence.")), mode="app"))
    printing = css_rules(media_block(css, "print"))
    assert [
        body
        for selector, body in printing
        if ".ro" in [s.strip() for s in selector.split(",")] and re.search(r"display:\s*none", body)
    ]


def test_readouts_show_on_hover_and_keyboard_focus_only():
    css = style_of(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    shown = [
        part.strip()
        for selector, body in css_rules(css)
        if re.search(r"display:\s*block", body)
        for part in selector.split(",")
        if names_readout(part)
    ]
    assert [s for s in shown if ":hover" in s]
    assert [s for s in shown if ":focus-visible" in s]
    # A click focuses the link; plain :focus would leave the readout up after the pointer goes.
    for selector, _ in css_rules(css):
        if names_readout(selector):
            assert not re.search(r":focus(?!-visible)", selector), selector


def test_readouts_never_animate():
    css = style_of(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    for selector, body in css_rules(css):
        if re.search(r"\.(ro|hot)\b", selector):
            assert not re.search(r"transition|animation", body), selector
    motion = media_block(css, "(prefers-reduced-motion: no-preference)")
    assert not re.search(r"\.(ro|hot)\b", motion)


def test_readouts_never_draw_through_a_hidden_column():
    """Review Focus 1: the frame narrows to one column while a numbers link has keyboard focus.
    The hidden column is visibility: hidden, which its readouts inherit; a child set to
    visibility: visible would still be drawn, so the readouts are shown and hidden by display."""
    html = render_html(
        with_score_table(report("Plain sentence.")),
        mode="app",
        column="auto",
        narrow=True,
        numbers=numbers(),
    )
    css = style_of(html)
    # Every visibility the page declares, in its stylesheet or in an element's style, hides: the
    # column put away. Anything else (visible, initial, unset…) could draw a readout through it.
    inline = ";".join(re.findall(r'style="([^"]*)"', html[html.index("</style>") :]))
    declared = re.findall(r"(?<![-\w])visibility\s*:\s*([^;}]+)", f"{css};{inline}")
    assert declared and {value.strip() for value in declared} == {"hidden"}, declared
    for selector, body in css_rules(css):
        if names_readout(selector):
            assert not re.search(r"visibility|opacity", body), selector
    base = [body for selector, body in css_rules(css) if selector == ".ro"]
    assert base and re.search(r"display:\s*none", base[0])


def test_key_tile_readouts_span_the_strip_once_the_tiles_have_risen():
    """The tiles rise in with a transform. Kept after the animation ends (fill forwards or both),
    it would make each tile the containing block of its readout, squeezed under that tile for
    good, instead of across the strip."""
    css = style_of(render_html(report("Plain sentence."), mode="app", column="auto", narrow=True))
    motion = media_block(css, "(prefers-reduced-motion: no-preference)")
    rising = [body for selector, body in css_rules(motion) if selector == ".keys > *"]
    assert rising and re.search(r"animation:.*\brise\b", rising[0])
    assert not re.search(r"\b(forwards|both)\b", rising[0]), rising[0]


class _Node:
    def __init__(self, tag: str, attrs: list[tuple[str, str | None]], parent: _Node | None):
        self.tag, self.parent = tag, parent
        self.attrs = {k: v or "" for k, v in attrs}
        self.classes = set(self.attrs.get("class", "").split())
        self.children: list[_Node] = []

    def walk(self):
        for child in self.children:
            yield child
            yield from child.walk()

    def ancestors(self):
        node = self.parent
        while node is not None:
            yield node
            node = node.parent


class _Tree(HTMLParser):
    """The page's elements as a tree, enough to follow which box holds which."""

    VOID = {"br", "hr", "img", "input", "link", "meta", "source", "wbr"}

    def __init__(self, html: str):
        super().__init__()
        self.root = self.at = _Node("#root", [], None)
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, attrs, self.at)
        self.at.children.append(node)
        if tag not in self.VOID:
            self.at = node

    def handle_startendtag(self, tag, attrs):
        self.at.children.append(_Node(tag, attrs, self.at))

    def handle_endtag(self, tag):
        node = self.at
        while node.parent is not None and node.tag != tag:
            node = node.parent
        if node.parent is not None:
            self.at = node.parent


def _compound(node: _Node, part: str) -> bool:
    part = re.sub(r":[\w-]+(\([^)]*\))?", "", part)
    tag = re.match(r"[a-z][a-z0-9]*", part)
    return (not tag or node.tag == tag.group(0)) and set(
        re.findall(r"\.([\w-]+)", part)
    ) <= node.classes


def _matches(node: _Node | None, tokens: list[str]) -> bool:
    """A selector of tags, classes, descendant, child (>) and next-sibling (+) combinators, read
    from the right, as the browser does."""
    if node is None or not _compound(node, tokens[-1]):
        return False
    rest = tokens[:-1]
    if not rest:
        return True
    if rest[-1] == ">":
        return _matches(node.parent, rest[:-1])
    if rest[-1] == "+":
        siblings = node.parent.children if node.parent else []
        at = siblings.index(node)
        return at > 0 and _matches(siblings[at - 1], rest[:-1])
    return any(_matches(up, rest) for up in node.ancestors())


def _positioned(css: str):
    """Whether the stylesheet positions an element, so that it holds the readouts inside it."""
    selectors = [
        re.findall(r"[>+~]|[^\s>+~]+", part)
        for selector, body in css_rules(css)
        if re.search(r"position:\s*(relative|absolute|fixed|sticky)", body)
        for part in selector.split(",")
        if not names_readout(part)
    ]
    return lambda node: any(_matches(node, tokens) for tokens in selectors)


def _first_or_last(node: _Node) -> str:
    """Whether a readout comes before all of its item's content, or after it. A ring's readouts
    come one after another, before the ring."""
    siblings = node.parent.children
    at = siblings.index(node)
    if all("ro" in s.classes for s in siblings[:at]):
        return "first"
    return "last" if all("ro" in s.classes for s in siblings[at + 1 :]) else "middle"


def test_a_panels_readouts_show_by_the_item_pointed_at():
    """The numbers column scrolls, and a tall panel's heading is often out of view while its bars
    and tiles are in it; a readout at the heading was then out of view too. Each item's readout
    shows by the item instead.

    A bar or red-flag row is as wide as its panel, so it holds its readout itself: the readout
    shows just above it, or below the first one under the heading, where above would leave the
    panel. A tile, figure, ring or legend entry is far narrower than its panel, and a readout
    held by it would wrap to many lines, so its panel holds the readout and keeps it panel-wide;
    the readout, with no top or bottom, stays at its place in the item (the start of the item,
    its first child) and is lifted by its own height to sit just above it. One marked below is
    the item's last child, at its bottom edge, and is not lifted."""
    html = render_html(report("Plain sentence."), mode="app", numbers=numbers())
    css = style_of(html)
    positioned = _positioned(css)
    tree = _Tree(html[html.index("<body") :])
    panels = [node for node in tree.root.walk() if node.tag == "section" and "p" in node.classes]
    assert len(panels) == 9
    held, lifted, below = [], [], []
    for panel in panels:
        for ro in (node for node in panel.walk() if "ro" in node.classes):
            box = next(up for up in ro.ancestors() if positioned(up))
            if any("cw" in up.classes for up in ro.ancestors()):
                continue  # a chart's readouts: test_a_charts_readouts_show_on_its_top_edge
            item = ro.parent
            if box is item:
                assert item.parent is panel and "hot" in item.classes, item.classes
                held.append(item)
            else:
                assert box is panel, (box.tag, box.classes, item.classes)
                assert _first_or_last(ro) == ("last" if "below" in ro.classes else "first")
                (below if "below" in ro.classes else lifted).append(item)
    held_kinds = {kind for item in held for kind in ("bar", "kv") if kind in item.classes}
    assert held_kinds == {"bar", "kv"} and len(held) == 3 + 3 + 4 + 1  # and the red-flag meter
    assert {"tile"} <= {c for item in below for c in item.classes}  # the first row of tiles
    assert len(lifted) + len(below) == 1 + 4 + 2 + 2 + 3 + 3 + 2 + 2  # with each ring's slices

    rules = css_rules(css)

    def rule(selector: str) -> str:
        found = [body for s, body in rules if selector in [p.strip() for p in s.split(",")]]
        assert found, selector
        return found[-1]

    def inset(body: str, side: str) -> str | None:
        found = re.search(rf"(?<![-\w]){side}:\s*([^;]+)", body)
        return found.group(1).strip() if found else None

    above, under = rule(".p > .hot > .ro"), rule(".p > h4 + .hot > .ro")
    assert inset(above, "bottom") not in (None, "auto") and inset(above, "top") is None
    assert inset(under, "top") not in (None, "auto") and inset(under, "bottom") == "auto"
    panel_wide = rule(".p .ro")
    assert inset(panel_wide, "top") is None and inset(panel_wide, "bottom") is None
    assert re.search(r"transform:\s*translateY\(-100%\)", panel_wide)
    assert re.search(r"transform:\s*none", rule(".p .ro.below"))


def test_the_panel_pointed_at_is_drawn_over_the_others():
    """A readout may reach past its panel's edge, over the next panel's glass, which would blur
    it and draw over it; the panel pointed at or focused comes to the front."""
    css = style_of(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    raised = [
        part.strip()
        for selector, body in css_rules(css)
        if re.search(r"z-index:\s*[1-9]", body)
        for part in selector.split(",")
    ]
    assert ".p:hover" in raised and ".p:focus-within" in raised


def test_a_charts_readouts_show_on_its_top_edge():
    """A chart's own readout, a week's and a case's show on the chart's top edge, as before; a
    method's row in the value-per-share chart is its own readout box, so its readout shows just
    above the row pointed at."""
    html = render_html(report("Plain sentence."), mode="app", numbers=numbers())
    css = style_of(html)
    positioned = _positioned(css)
    tree = _Tree(html[html.index("<body") :])
    boxes = {}
    for chart in (node for node in tree.root.walk() if "cw" in node.classes):
        for ro in (node for node in chart.walk() if "ro" in node.classes):
            box = next(up for up in ro.ancestors() if positioned(up))
            kind = "row" if "col" in ro.parent.parent.classes else "chart"
            held = "chart" if box is chart or "hits" in box.classes else "?"
            boxes.setdefault(kind, set()).add("item" if box is ro.parent else held)
    assert boxes == {"chart": {"chart"}, "row": {"item"}}, boxes
    tops = [body for selector, body in css_rules(css) if selector == ".cw .ro"]
    assert tops and re.search(r"bottom:\s*100%", tops[0])
    assert re.search(r"transform:\s*none", tops[0])


def _ring(html: str, label: str) -> str:
    start = html.index(f'aria-label="{label}')
    return html[start : html.index("</svg>", start)]


ARC = re.compile(r"A ([\d.]+) ([\d.]+) 0 ([01]) ([01]) (-?[\d.]+) (-?[\d.]+)")


def _slices(svg: str) -> list[tuple[str, str]]:
    """Each slice of a ring as (key, the path's d)."""
    return re.findall(r'<path class="dn-seg dn-([a-z]+)" d="([^"]+)"', svg)


def _turn(x: float, y: float, centre: float) -> float:
    """How far round the ring a point is, as a fraction, the way the slices run."""
    return (math.atan2(y - centre, x - centre) / math.tau) % 1


def test_each_ring_slice_is_an_arc_of_its_own():
    """A slice drawn as a whole circle with a dash still takes the pointer all the way round, so
    the top one caught points over the others. Each is its own arc, stroked along its span only,
    from where the last one's share ended to its own share less a 2 px gap, as the dashes ran."""
    html = render_html(report("Plain sentence."), mode="app", numbers=numbers())
    size, stroke = 80, 10
    rad = (size - stroke) / 2 - 1
    centre, around = size / 2, math.tau * rad
    for label, counts in (
        ("Peer ratings: 8 Buy, 26 Hold, 7 Sell", (("buy", 8), ("hold", 26), ("sell", 7))),
        ("41 claims kept, 12 removed", (("kept", 41), ("removed", 12))),
    ):
        svg = _ring(html, label)
        assert "stroke-dasharray" not in svg and '<circle class="dn-seg' not in svg
        slices = _slices(svg)
        assert [key for key, _ in slices] == [key for key, _ in counts]
        total, done = sum(count for _, count in counts), 0.0
        for (key, d), (_, count) in zip(slices, counts, strict=True):
            start = re.match(r"M (-?[\d.]+) (-?[\d.]+) ", d)
            arcs = ARC.findall(d)
            assert start and len(arcs) == 1, (key, d)
            rx, ry, large, sweep, x1, y1 = arcs[0]
            x0, y0 = float(start.group(1)), float(start.group(2))
            assert float(rx) == float(ry) == rad and sweep == "1", (key, d)
            for x, y in ((x0, y0), (float(x1), float(y1))):
                assert math.hypot(x - centre, y - centre) == pytest.approx(rad, abs=0.01), key
            share = count / total
            span = max(share * around - 2, 0.5) / around
            assert _turn(x0, y0, centre) == pytest.approx(done % 1, abs=1e-3), key
            assert _turn(float(x1), float(y1), centre) == pytest.approx(done + span, abs=1e-3), key
            assert large == ("1" if span > 0.5 else "0"), key
            done += share


def test_a_ring_with_one_slice_draws_the_whole_circle():
    """An arc from a point back to itself draws nothing, so a slice that holds every count is
    drawn as two halves, closed, the whole way round."""
    n = numbers()
    n["peer_ratings"] = {"Buy": 5, "Hold": 0, "Sell": 0}
    html = render_html(report("Plain sentence."), mode="app", numbers=n)
    slices = _slices(_ring(html, "Peer ratings: 5 Buy, 0 Hold, 0 Sell"))
    assert [key for key, _ in slices] == ["buy"]
    d = slices[0][1]
    start = re.match(r"M (-?[\d.]+) (-?[\d.]+) ", d)
    arcs = ARC.findall(d)
    assert start and len(arcs) == 2 and d.rstrip().endswith("Z"), d
    centre, rad = 40, 34
    first = (float(start.group(1)), float(start.group(2)))
    assert first == pytest.approx((centre + rad, centre))
    assert (float(arcs[0][4]), float(arcs[0][5])) == pytest.approx((centre - rad, centre))
    assert (float(arcs[1][4]), float(arcs[1][5])) == pytest.approx(first)
    assert all(arc[3] == "1" for arc in arcs)


def test_a_ring_slice_can_be_pointed_at():
    """The count in the ring's middle covers the whole ring; it lets the pointer through to the
    slices, and pointing at a slice still shows its readout."""
    css = style_of(render_html(report("Plain sentence."), mode="app", numbers=numbers()))
    count = [body for selector, body in css_rules(css) if selector == ".dn b"]
    assert count and re.search(r"pointer-events:\s*none", count[0])
    shown = [
        part.strip()
        for selector, body in css_rules(css)
        if re.search(r"display:\s*block", body)
        for part in selector.split(",")
    ]
    for key in ("buy", "hold", "sell", "kept", "removed"):
        assert f".donut:has(.dn-{key}:hover) > .ro-{key}" in shown, key
    # The slices' draw-in is the only dash they ever have, and only while it plays.
    still = re.sub(r"@media \(prefers-reduced-motion[^{]*\{.*", "", css, flags=re.S)
    for selector, body in css_rules(still):
        if "dn-seg" in selector:
            assert "dasharray" not in body, selector


def test_the_key_strip_can_narrow_with_the_frame():
    """A hot key tile is a link around the tile; as a grid item it would keep its content's width
    and push the strip wider than a narrow frame."""
    css = style_of(render_html(report("Plain sentence."), mode="app", column="auto", narrow=True))
    assert [
        body
        for selector, body in css_rules(css)
        if ".keys > .hot" in [s.strip() for s in selector.split(",")]
        and re.search(r"min-width:\s*0", body)
    ]


def test_the_not_advice_line_sits_with_the_rating_and_at_the_end():
    # docs/launch/launch-readiness.md, M5: with the rating, not only at the foot of the text.
    from tearsheet.render import ADVICE_LINE, ADVICE_SHORT

    r = report("Plain sentence.")
    html = render_html(r, mode="app", numbers=numbers())
    column = html[html.index('id="numbers"') : html.index("</aside>")]
    assert ADVICE_SHORT in column
    assert ADVICE_LINE in html[html.index("</aside>") :]
    # The numbers column alone (a narrow window's other side) still carries it.
    assert ADVICE_SHORT in render_html(r, mode="app", column="numbers", numbers=numbers())
    assert ADVICE_LINE in render_html(r, mode="file", numbers=numbers())
