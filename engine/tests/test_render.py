"""Filling placeholders and rendering the HTML (design items 31 and 32)."""

from __future__ import annotations

import re
from datetime import date

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


def test_the_page_has_its_own_content_security_policy_and_only_safe_links():
    html = render_html(report("Plain sentence."), mode="app")
    assert "default-src 'none'; style-src 'unsafe-inline'; img-src data:" in html
    for href in re.findall(r'href="([^"]+)"', html):
        assert href.startswith(("https://", "tearsheet://")), href
    assert "tearsheet://flag/business.1" in html
    assert "tearsheet://reread/acc" in html


def test_file_mode_shows_claim_ids_and_accessions_without_app_links():
    html = render_html(report("Plain sentence."), mode="file")
    assert "tearsheet://" not in html
    assert "business.1" in html
    assert "acc" in html
