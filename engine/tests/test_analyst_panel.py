"""The Analyst ratings panel at the foot of the report's numbers column (design item 20). It shows
analystdb's figures as of the report's price date, each with its readout and a link to the side
panel's Analyst ratings view; when analystdb can't answer it is one quiet line, and without it the
report is exactly as it was."""

from __future__ import annotations

import asyncio
import re
from html import unescape

import httpx
import pytest

from tearsheet import readouts
from tearsheet.data.analyst import NOT_AVAILABLE
from tearsheet.render import render_html
from tests.test_analystdb import REPORT_DAY, Service
from tests.test_render import hrefs, numbers, report


def ok_panel(**changes) -> dict:
    panel = asyncio.run(Service().client().panel("AMD", REPORT_DAY))
    panel.update(changes)
    return panel


def quiet_panel() -> dict:
    return asyncio.run(
        Service({"/consensus/AMD": httpx.ConnectError("refused")}).client().panel("AMD", REPORT_DAY)
    )


def with_rating_section(r: dict) -> dict:
    """The report with its code-written section 1, which says the consensus isn't available."""
    r["sections"].insert(
        0,
        {
            "key": "rating",
            "number": 1,
            "title": "Rating, score and range",
            "paragraphs": ["Rating: Hold.", NOT_AVAILABLE, "Total return over the past 12 months."],
            "sentences": [],
        },
    )
    return r


def page(
    analysts: dict | None, *, view: str = "summary", nums: dict | None = None, mode="app"
) -> str:
    return render_html(
        with_rating_section(report("Plain sentence.")),
        mode=mode,
        view=view,
        numbers=numbers() if nums is None else nums,
        analysts=analysts,
    )


def panel_html(html: str) -> str:
    start = html.index('id="analysts"')
    start = html.rindex("<section", 0, start)
    return html[start : html.index("</section>", start)]


def words(html: str) -> str:
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", html)).split())


def test_without_analystdb_the_report_is_exactly_as_before():
    r = with_rating_section(report("Plain sentence."))
    before = render_html(r, mode="app", numbers=numbers())
    assert render_html(r, mode="app", numbers=numbers(), analysts=None) == before
    assert 'id="analysts"' not in before


def test_the_panel_shows_the_firms_sides_and_targets():
    panel = panel_html(page(ok_panel()))
    text = words(panel)
    assert text.startswith("Analyst ratings analystdb, as of 6 Nov 2026")
    assert "<b>38</b>" in panel
    for part in ("32 Buy", "6 Hold", "0 Sell", "Average target $587.92", "Median $625.00"):
        assert part in text, part
    assert "High $800.00" in text and "Low $265.00" in text
    assert text.endswith(
        "Source: analystdb, 38 firms, as of 6 Nov 2026. General research, not personalised investment advice."
    )


def test_the_panel_sits_last_in_the_numbers_column():
    html = page(ok_panel())
    assert html.index("Peer ratings and checks") < html.index('id="analysts"')
    assert html.index('id="analysts"') < html.index("</aside>")


def test_every_part_of_the_panel_opens_the_analyst_view():
    html = page(ok_panel())
    links = set(hrefs(panel_html(html)))
    assert links == {
        "tearsheet://open/analysts/buy",
        "tearsheet://open/analysts/hold",
        "tearsheet://open/analysts/sell",
        "tearsheet://open/analysts/firms",
    }
    # The peer ratings ring above it still opens its own view.
    assert "tearsheet://open/rings/buy" in hrefs(html)


def test_a_side_no_firm_takes_has_no_slice_but_keeps_its_line():
    panel = panel_html(page(ok_panel()))
    assert 'class="dn-seg dn-sell"' not in panel and 'class="dn-seg dn-buy"' in panel
    assert "0 Sell" in words(panel)


def test_each_part_reads_out_in_the_fixed_wording():
    text = unescape(panel_html(page(ok_panel())))
    for wording in (
        readouts.analyst_side("Buy", 32, 38, "6 Nov 2026"),
        readouts.analyst_side("Sell", 0, 38, "6 Nov 2026"),
        readouts.analyst_target("mean", 587.92, 38),
        readouts.analyst_target("low", 265.0, 38),
        readouts.analyst_band(265.0, 800.0, 587.92, 625.0, 233.70, 200.13, "4 Nov 2026"),
    ):
        assert wording in text, wording
    assert "Buy: 32 of 38 firms rate it Buy or Strong Buy, as of 6 Nov 2026." in text
    assert (
        "Analyst targets run from $265.00 to $800.00 (average $587.92, median $625.00). "
        "Tearsheet’s base value is $233.70; the price on 4 Nov 2026 was $200.13."
    ) in text


def test_tearsheets_base_value_and_the_price_are_marked_on_the_target_bar():
    panel = panel_html(page(ok_panel()))
    assert 'class="abase"' in panel and 'class="apx"' in panel
    assert "Tearsheet base $234" in words(panel) and "price $200" in words(panel)
    plain = numbers()
    plain["range"], plain["price"], plain["weekly"] = None, None, None
    bare = panel_html(page(ok_panel(), nums=plain))
    assert 'class="abase"' not in bare and 'class="apx"' not in bare
    assert "Tearsheet base" not in words(bare)


def test_a_bar_with_no_targets_says_not_available():
    panel = panel_html(
        page(ok_panel(target={"mean": None, "median": None, "high": None, "low": None, "n": 0}))
    )
    assert 'class="astrip"' not in panel
    assert "Average target not available" in words(panel)


def test_a_stale_source_is_noted():
    text = words(panel_html(page(ok_panel(stale=["yahoo", "fmp"]))))
    assert (
        "Some of this may be out of date: yahoo and fmp missed analystdb’s last evening run."
        in text
    )
    assert "out of date" not in words(panel_html(page(ok_panel())))


def test_a_day_rebuilt_from_history_says_so():
    assert "rebuilt from history" in words(panel_html(page(ok_panel(rebuilt=True))))


@pytest.mark.parametrize("state", ["down", "missing"])
def test_when_analystdb_cant_answer_the_panel_is_one_quiet_line(state):
    analysts = (
        quiet_panel()
        if state == "down"
        else asyncio.run(Service({}).client().panel("AMD", REPORT_DAY))
    )
    panel = panel_html(page(analysts))
    assert words(panel) == analysts["note"]
    assert "tearsheet://open/analysts" not in panel
    assert 'class="aquiet"' in panel


def test_the_not_available_line_is_hidden_only_while_the_panel_shows():
    assert NOT_AVAILABLE not in unescape(page(ok_panel(), view="full"))
    assert NOT_AVAILABLE in unescape(page(quiet_panel(), view="full"))
    assert NOT_AVAILABLE in unescape(page(None, view="full"))


def test_a_file_never_shows_the_panel():
    html = page(ok_panel(), mode="file")
    assert 'id="analysts"' not in html and NOT_AVAILABLE in unescape(html)
