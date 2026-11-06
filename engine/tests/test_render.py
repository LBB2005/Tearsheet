"""Filling placeholders and rendering the HTML (design items 31 and 32)."""

from __future__ import annotations

import re
from datetime import date, timedelta

import pytest

from tearsheet.render import PlaceholderValue, fill, format_value, render_html


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


def test_no_script_tags_anywhere():
    for mode in ("app", "file"):
        for view in ("summary", "full"):
            for n in (numbers(), None):
                html = render_html(report("Plain sentence."), mode=mode, view=view, numbers=n)
                assert "<script" not in html.lower()
