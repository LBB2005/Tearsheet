"""The report downloads (export/, docs/superpowers/specs/2026-11-08-report-downloads-design.md):
the PDF's print page, the slide deck and the Excel workbook, each made from a saved report with
no AI. Every number and quote must be the saved report's, every file must carry the label, and
making them must never write to the store."""

from __future__ import annotations

import base64
import html
import io
import json

import pytest
from openpyxl import load_workbook
from pptx import Presentation

from tearsheet.export import data as export_data
from tearsheet.export import deck, pdf, workbook
from tearsheet.export.data import LABEL
from tearsheet.protocol import ExportResult
from tests.test_pipeline import company_facts
from tests.test_protocol import Harness, run
from tests.test_server_lookups import _one_report


def _report(tmp_path, *, facts: bool = True) -> tuple[Harness, dict]:
    """One saved report from the engine's fakes (company T0). With `facts`, the run's SEC
    company facts are put in the raw store too, as a live run stores them, for the workbook's
    Financials tab."""
    h = Harness(tmp_path)

    async def go():
        return await _one_report(h)

    ready = run(go())
    if facts:
        row = h.server.db.conn.execute(
            "SELECT u.run_id, u.cik FROM reports r JOIN runs u USING (run_id) WHERE r.report_id = ?",
            (ready["report_id"],),
        ).fetchone()
        h.server.rawstore.put(
            json.dumps(company_facts(row[1] - 1000)).encode(),
            f"https://data.sec.gov/api/xbrl/companyfacts/CIK{row[1]:010d}.json",
            "sec",
            "application/json",
            row[0],
        )
    return h, ready


def _export(h: Harness, report_id: str, kind: str) -> dict:
    async def go():
        return await h.call("export_report", {"report_id": report_id, "kind": kind}, id_=9)

    reply = run(go())
    assert "result" in reply, reply
    ExportResult.model_validate(reply["result"])
    return reply["result"]


def _load(h: Harness, report_id: str) -> export_data.ExportData:
    return export_data.load(h.server.db.conn, report_id, raw_dir=h.server.paths.raw)


# --- reading a saved report ------------------------------------------------------------------------


def test_each_citation_gets_its_own_note_in_report_order(tmp_path):
    h, ready = _report(tmp_path)
    d = _load(h, ready["report_id"])
    assert [n.number for n in d.notes] == list(range(1, len(d.notes) + 1))
    claimed = [x for s in d.sections for c in s.claims for x in c.notes]
    assert claimed == [n.number for n in d.notes]
    stored = json.loads(
        h.server.db.conn.execute(
            "SELECT json FROM sections WHERE report_id = ? AND key = 'report'",
            (ready["report_id"],),
        ).fetchone()[0]
    )
    quotes = [
        c.get("text")
        for s in stored["sections"]
        for sent in s.get("sentences") or []
        for c in sent.get("citations") or []
    ]
    assert [n.quote for n in d.notes] == quotes
    assert [c.text for _, c in d.key_points()] == [
        s["sentences"][0]["text"] for s in stored["sections"] if s.get("sentences")
    ]
    h.server.close()


def test_an_unknown_report_is_an_engine_error(tmp_path):
    h, _ = _report(tmp_path, facts=False)

    async def go():
        return await h.call("export_report", {"report_id": "rep-nope", "kind": "xlsx"}, id_=9)

    reply = run(go())
    assert reply["error"]["data"]["code"] == "ENGINE_ERROR"
    h.server.close()


def test_a_kind_the_engine_doesnt_make_is_refused(tmp_path):
    h, ready = _report(tmp_path, facts=False)

    async def go():
        return await h.call(
            "export_report", {"report_id": ready["report_id"], "kind": "docx"}, id_=9
        )

    assert "error" in run(go())
    h.server.close()


def test_making_every_file_writes_nothing_to_the_store(tmp_path):
    h, ready = _report(tmp_path)
    conn = h.server.db.conn
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    before = {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}
    changes = conn.total_changes
    for kind in ("pdf", "pptx", "xlsx"):
        _export(h, ready["report_id"], kind)
    assert conn.total_changes == changes
    assert {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables} == before
    h.server.close()


# --- the workbook ------------------------------------------------------------------------------


def test_the_workbook_holds_the_reports_numbers_and_every_check_passes(tmp_path):
    h, ready = _report(tmp_path)
    got = _export(h, ready["report_id"], "xlsx")
    assert got["file_name"].startswith("T0 Tearsheet ") and got["file_name"].endswith(".xlsx")
    assert got["html"] is None
    d = _load(h, ready["report_id"])
    wb = load_workbook(io.BytesIO(base64.b64decode(got["data_base64"])))
    assert wb.sheetnames == ["Summary", "Financials", "Valuation", "Peers", "Sources & checks"]

    def named(name: str):
        sheet, cell = next(iter(wb.defined_names[name].destinations))
        return wb[sheet][cell.replace("$", "")].value

    n = d.numbers
    assert named("Price") == n["price"]["value"]
    assert named("ReportValue") == n["estimate"]["value"]
    for key in ("bear", "base", "bull"):
        assert named(key.capitalize()) == n["range"][key]
    assert named("Rating") == n["rating"]["call"]
    for m in d.methods:
        if m.value is not None:
            assert named(f"Method_{m.code}") == m.value
    checks = workbook._plan_checks(d)
    assert checks and all(c["result"] == "OK" for c in checks)
    # The Financials tab: three fiscal years from the stored company facts, then the LTM.
    fin = wb["Financials"]
    heads = [fin.cell(row=5, column=c).value for c in range(3, 7)]
    assert heads[-1] == "LTM" and all(str(x).startswith("FY") for x in heads[:-1])
    assert d.history is not None and any(
        c["what"].startswith("Revenue, last 12 months") for c in checks
    )
    # Every note, with its quote, in the Sources & checks tab.
    text = "\n".join(
        str(c.value)
        for row in wb["Sources & checks"].iter_rows()
        for c in row
        if c.value is not None
    )
    for note in d.notes:
        assert f"{note.number}.  {note.label}" in text
        if note.quote:
            assert note.quote in text
    summary = "\n".join(
        str(c.value) for row in wb["Summary"].iter_rows() for c in row if c.value is not None
    )
    assert LABEL in summary
    for ws in wb.worksheets:
        assert LABEL in ws.oddFooter.left.text
        # On screen too: every tab's first row under the frozen header (launch-readiness M5).
        assert LABEL in [c.value for c in ws[4]], ws.title
    h.server.close()


def test_a_wrong_figure_fails_its_check(tmp_path):
    h, ready = _report(tmp_path)
    d = _load(h, ready["report_id"])
    d.numbers["estimate"]["value"] += 1.0
    wrong = [c for c in workbook._plan_checks(d) if c["result"] != "OK"]
    assert [c["what"] for c in wrong] == [
        "Estimated value: the median of the methods (formula) vs the report's"
    ]
    d = _load(h, ready["report_id"])
    assert any(c["what"].startswith("Revenue, last 12 months") for c in workbook._plan_checks(d))
    fig = d.history.ltm["revenue"]
    d.history.ltm["revenue"] = type(fig)(**{**fig.__dict__, "value": fig.value + 10_000_000})
    assert any(
        c["result"] == "CHECK" and c["what"].startswith("Revenue") for c in workbook._plan_checks(d)
    )
    h.server.close()


def _section(ws, title: str) -> list[tuple]:
    """The rows under a Valuation-tab section band, as (label, value, note, comment, colour)."""
    rows = list(ws.iter_rows(min_col=2, max_col=5))
    start = next(i for i, row in enumerate(rows) if row[0].value == title)
    out = []
    for row in rows[start + 1 :]:
        label, value, _, meaning = row
        if label.value is None and value.value is None:
            break
        out.append(
            (
                label.value,
                value.value,
                meaning.value,
                value.comment.text if value.comment else None,
                value.font.color.rgb if value.font and value.font.color else None,
            )
        )
    return out


def test_the_valuation_tab_shows_each_methods_saved_assumptions(tmp_path):
    from tearsheet.valuation import saved

    h, ready = _report(tmp_path)
    got = _export(h, ready["report_id"], "xlsx")
    wb = load_workbook(io.BytesIO(base64.b64decode(got["data_base64"])))
    rows = _section(wb["Valuation"], "Assumptions behind each method")
    stored = saved.load(h.server.db.conn, ready["run_id"])
    by_label = {r[0]: r for r in rows}
    labels = [r[0] for r in rows]
    for heading in (
        "Discounted cash flow (DCF)",
        "Residual income",
        "Peer multiples (P/E, EV/EBIT)",
        "12-month range",
    ):
        assert heading in labels
    methods = {m["method"]: m["details"] for m in stored["methods"]}
    for label, value in (
        ("Discount rate", methods["dcf"]["discount_rate"]),
        ("Terminal growth", methods["dcf"]["terminal_growth"]),
        ("Terminal value, share of firm value", methods["dcf"]["terminal_share"]),
        ("Operating margin today", methods["dcf"]["start_margin"]),
        ("Return on equity today", methods["residual_income"]["start_roe"]),
        ("Book value today, US$ millions", methods["residual_income"]["book_value"] / 1e6),
        ("Peer P/E", methods["multiples"]["pe_multiple"]),
        ("Peers kept for EV/EBIT", methods["multiples"]["ev_ebit_peers"]),
        ("Dividend yield", stored["range"]["dividend_yield"]),
        ("Peer median volatility", stored["range"]["peer_median_volatility"]),
        ("Volatility used for the range", stored["range"]["blended_volatility"]),
    ):
        row = by_label[label]
        assert row[1] == pytest.approx(value), label
        assert row[3] == workbook.SAVED_NOTE and row[4] == "FF0000FF", label  # typed, in blue
    # Two cost-of-equity rows (DCF and residual income) and one for the range, all the same.
    coe = [r[1] for r in rows if r[0] == "Cost of equity"]
    assert len(coe) == 3 and len(set(coe)) == 1
    # The rest of the workbook is unchanged: every check still passes.
    assert all(c["result"] == "OK" for c in workbook._plan_checks(_load(h, ready["report_id"])))
    h.server.close()


def test_a_report_from_before_the_assumptions_were_saved_says_so(tmp_path):
    from tearsheet.valuation import saved

    h, ready = _report(tmp_path)
    conn = h.server.db.conn
    with conn:
        conn.execute(
            "DELETE FROM step_outputs WHERE run_id = ? AND step = ?", (ready["run_id"], saved.STEP)
        )
    got = _export(h, ready["report_id"], "xlsx")
    wb = load_workbook(io.BytesIO(base64.b64decode(got["data_base64"])))
    rows = _section(wb["Valuation"], "Assumptions behind each method")
    assert [r[0] for r in rows] == [workbook.NOT_SAVED]
    assert workbook.NOT_SAVED == "Not saved for this report (made before 8 Nov 2026)."
    assert all(c["result"] == "OK" for c in workbook._plan_checks(_load(h, ready["report_id"])))
    h.server.close()


def test_without_the_raw_store_the_workbook_says_so(tmp_path):
    h, ready = _report(tmp_path, facts=False)
    got = _export(h, ready["report_id"], "xlsx")
    wb = load_workbook(io.BytesIO(base64.b64decode(got["data_base64"])))
    assert "can't be shown" in str(wb["Financials"]["B5"].value)
    h.server.close()


# --- the deck ----------------------------------------------------------------------------------


def _slide_texts(blob: bytes) -> list[str]:
    deck_ = Presentation(io.BytesIO(blob))
    out = []
    for slide in deck_.slides:
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                parts.append(shape.text_frame.text)
            if shape.has_table:
                parts.extend(cell.text for row in shape.table.rows for cell in row.cells)
        out.append("\n".join(parts))
    return out


def test_the_deck_has_12_main_slides_and_an_appendix_each_with_the_label(tmp_path):
    h, ready = _report(tmp_path)
    got = _export(h, ready["report_id"], "pptx")
    assert got["file_name"].endswith(".pptx")
    slides = _slide_texts(base64.b64decode(got["data_base64"]))
    assert len(slides) >= 17
    assert all(LABEL in s for s in slides)
    d = _load(h, ready["report_id"])
    n = d.numbers
    cover = slides[0]
    assert n["rating"]["call"].upper() in cover
    # The disclaimer says the deck is not a recommendation, so no slide is labelled one.
    assert not any("Recommendation" in s for s in slides)
    assert f"${n['price']['value']:,.2f}" in cover and f"${n['range']['base']:,.2f}" in cover
    assert "Important information" in slides[-1]
    h.server.close()


def test_slides_copy_claims_whole_never_cut(tmp_path):
    h, ready = _report(tmp_path)
    d = _load(h, ready["report_id"])
    text = "\n".join(_slide_texts(deck.build(d)))
    claims = [c.text for s in d.sections for c in s.claims]
    shown = [c for c in claims if c in text]
    assert shown, "no claim made it onto a slide"
    for c in claims:
        # A claim is either there in full or not there at all: never its first words alone.
        assert c in text or c[:40] not in text
    h.server.close()


# --- the PDF's print page ------------------------------------------------------------------------


def test_the_print_page_has_the_call_every_claim_and_every_source(tmp_path):
    h, ready = _report(tmp_path)
    got = _export(h, ready["report_id"], "pdf")
    assert got["file_name"].endswith(".pdf") and got["data_base64"] is None
    page = html.unescape(got["html"])
    d = _load(h, ready["report_id"])
    n = d.numbers
    assert pdf.headline(d) in page
    assert f"${n['range']['base']:,.2f}" in page and f"${n['price']['value']:,.2f}" in page
    for s in d.sections:
        for c in s.claims:
            assert c.text in page
    for note in d.notes:
        assert f'value="{note.number}"' in got["html"]
        if note.quote:
            assert note.quote in page
    assert LABEL in page and LABEL in got["footer"]
    assert "<script" not in got["html"] and "tearsheet://" not in got["html"]
    assert "default-src 'none'" in got["html"]
    h.server.close()


@pytest.mark.parametrize("text", ['<img src=x onerror="alert(1)">', "Q&A <b>bold</b>"])
def test_report_text_is_escaped_on_the_print_page(tmp_path, text):
    h, ready = _report(tmp_path, facts=False)
    d = _load(h, ready["report_id"])
    first = next(s for s in d.sections if s.claims)
    claim = first.claims[0]
    d.sections[d.sections.index(first)] = type(first)(
        **{
            **first.__dict__,
            "claims": (type(claim)(**{**claim.__dict__, "text": text}),) + first.claims[1:],
        }
    )
    page = pdf.render(d)
    assert text not in page
    assert "<img src=x" not in page and "<b>bold" not in page
    assert html.escape(text.split(" ")[0]) in page
    h.server.close()


def test_the_report_page_ends_with_the_three_download_links(tmp_path):
    h, ready = _report(tmp_path, facts=False)

    async def go():
        return await h.call("get_report", {"report_id": ready["report_id"]}, id_=3)

    page = run(go())["result"]["html"]
    for kind, words in (
        ("pdf", "Download PDF"),
        ("pptx", "Download slide deck"),
        ("xlsx", "Download Excel"),
    ):
        assert f'href="tearsheet://download/{kind}/{ready["report_id"]}"' in page
        assert words in page
    h.server.close()


def test_a_report_file_has_no_download_links():
    from tearsheet.render import render_html

    page = render_html(
        {"company": "X", "ticker": "X", "sections": []}, mode="file", report_id="rep-1"
    )
    assert "tearsheet://download" not in page
