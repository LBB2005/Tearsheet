"""analystdb, Liam's local analyst-ratings API (design item 20): asked when a report opens, as of
the report's price date; nothing from it is stored, and it never gets in the way of the report.
The answers are saved real ones (tests/fixtures/analystdb, AMD as of 6 Nov 2026)."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import date
from pathlib import Path

import httpx
import pytest

from tearsheet.data import analystdb
from tearsheet.data.analystdb import AnalystDB

FIXTURES = Path(__file__).parent / "fixtures" / "analystdb"
REPORT_DAY = date(2026, 11, 6)
DOWN = "Analyst ratings: analystdb isn’t answering."


def saved(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class Service:
    """A stand-in for analystdb: answers each path from the saved answers, or with the failure
    put in its place, and keeps every request."""

    def __init__(self, answers: dict | None = None):
        self.answers = (
            answers
            if answers is not None
            else {
                "/consensus/AMD": saved("consensus_AMD"),
                "/events/AMD": saved("events_AMD"),
                "/scorecards/firms": saved("scorecards_firms"),
                "/crosscheck/AMD": saved("crosscheck_AMD"),
            }
        )
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.get(request.url.path)
        if answer is None:
            return httpx.Response(404, json={"detail": "unknown ticker", "suggestions": []})
        if isinstance(answer, Exception):
            raise answer
        if isinstance(answer, httpx.Response):
            return answer
        return httpx.Response(200, json=answer)

    def client(self, **kwargs) -> AnalystDB:
        return AnalystDB(transport=httpx.MockTransport(self.handler), **kwargs)

    def paths(self) -> list[str]:
        return [r.url.path for r in self.requests]


def panel_of(service: Service, ticker: str = "AMD", day: date = REPORT_DAY, **kwargs) -> dict:
    return asyncio.run(service.client(**kwargs).panel(ticker, day))


def view_of(service: Service, ticker: str = "AMD", day: date = REPORT_DAY) -> dict:
    return asyncio.run(service.client().view(ticker, day))


# --- the panel ----------------------------------------------------------------------------------


def test_the_panel_reads_the_ratings_and_targets_as_of_the_reports_day():
    service = Service()
    panel = panel_of(service)
    assert panel["state"] == "ok" and panel["note"] is None
    assert panel["ticker"] == "AMD"
    assert panel["n_firms"] == 38
    assert panel["sides"] == {"buy": 32, "hold": 6, "sell": 0}
    assert panel["target"] == {
        "mean": 587.92,
        "median": 625.0,
        "high": 800.0,
        "low": 265.0,
        "n": 38,
    }
    assert panel["asof"] == "2026-11-06" and panel["asof_text"] == "6 Nov 2026"
    assert panel["stale"] == [] and panel["rebuilt"] is False
    (request,) = service.requests
    assert str(request.url) == "http://127.0.0.1:8765/consensus/AMD?asof=2026-11-06"


def test_only_analystdb_on_this_mac_is_asked_and_nothing_secret_is_sent():
    service = Service()
    view_of(service)
    assert sorted(service.paths()) == [
        "/consensus/AMD",
        "/crosscheck/AMD",
        "/events/AMD",
        "/scorecards/firms",
    ]
    assert {(r.url.scheme, r.url.host, r.url.port) for r in service.requests} == {
        ("http", "127.0.0.1", 8765)
    }
    assert {r.method for r in service.requests} == {"GET"}
    for request in service.requests:
        assert "authorization" not in request.headers and "cookie" not in request.headers
        assert not {k.lower() for k in request.url.params} & {"apikey", "api_key", "key", "token"}


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("connection refused"),
        httpx.Response(500, text="Internal Server Error"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"data": {"ticker": "AMD"}, "asof": "2026-11-06"}),
        httpx.Response(200, json=[1, 2, 3]),
        # A redirect is never followed: only analystdb's own address is ever asked.
        httpx.Response(307, headers={"location": "http://example.com/consensus/AMD"}),
    ],
    ids=["refused", "server-error", "not-json", "missing-fields", "wrong-shape", "redirect"],
)
def test_a_broken_answer_gives_the_quiet_line_and_never_raises(failure):
    service = Service({"/consensus/AMD": failure})
    panel = panel_of(service)
    assert panel["state"] == "down" and panel["note"] == DOWN
    assert len(service.requests) == 1


def test_a_slow_answer_is_given_up_on_within_the_time_limit():
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json=saved("consensus_AMD"))

    client = AnalystDB(transport=httpx.MockTransport(slow), time_limit=0.05)
    started = time.monotonic()
    panel = asyncio.run(client.panel("AMD", REPORT_DAY))
    assert time.monotonic() - started < 1
    assert panel["state"] == "down" and panel["note"] == DOWN


def test_the_time_limit_is_half_a_second_and_answers_keep_four_hours():
    assert analystdb.TIME_LIMIT_S == 0.5
    assert analystdb.KEEP_S == 4 * 60 * 60
    assert analystdb.QUIET_S == 60


@pytest.mark.parametrize(
    "answer",
    [
        None,  # 404: a ticker analystdb doesn't know
        httpx.Response(422, json={"detail": "asof is before AMD's first stored change"}),
    ],
)
def test_a_company_or_day_analystdb_has_nothing_for_gives_its_own_quiet_line(answer):
    service = Service({} if answer is None else {"/consensus/AMD": answer})
    panel = panel_of(service)
    assert panel["state"] == "missing"
    assert panel["note"] == "Analyst ratings: analystdb has none for AMD as of 6 Nov 2026."


def test_a_company_no_firm_covers_has_nothing_to_show():
    answer = saved("consensus_AMD")
    answer["data"].update(
        n_firms=0,
        firms=[],
        sides={"buy": 0, "hold": 0, "sell": 0},
        counts={k: 0 for k in answer["data"]["counts"]},
        target={"mean": None, "median": None, "high": None, "low": None, "n": 0},
    )
    panel = panel_of(Service({"/consensus/AMD": answer}))
    assert panel["state"] == "missing"
    assert panel["note"] == "Analyst ratings: analystdb has none for AMD as of 6 Nov 2026."


def test_a_source_that_missed_the_evening_run_is_named():
    answer = saved("consensus_AMD")
    for source in answer["sources"]:
        source["stale"] = source["name"] in ("yahoo", "fmp")
    panel = panel_of(Service({"/consensus/AMD": answer}))
    assert panel["state"] == "ok" and panel["stale"] == ["yahoo", "fmp"]


def test_a_day_before_analystdb_started_collecting_says_it_was_rebuilt():
    answer = saved("consensus_AMD")
    answer["rebuilt"] = True
    assert panel_of(Service({"/consensus/AMD": answer}))["rebuilt"] is True


def test_a_share_class_is_asked_for_with_a_dot():
    service = Service({"/consensus/BRK.B": saved("consensus_AMD")})
    assert panel_of(service, "brk-b")["state"] == "ok"
    assert service.paths() == ["/consensus/BRK.B"]


@pytest.mark.parametrize("ticker", ["../health", "AMD/../../x", "", "A" * 20, "AMD?asof=1"])
def test_an_odd_ticker_is_never_put_in_an_address(ticker):
    service = Service()
    panel = panel_of(service, ticker)
    assert panel["state"] == "missing" and service.requests == []


def test_answers_are_kept_for_four_hours_per_company_and_day():
    clock = Clock()
    service = Service()
    client = service.client(clock=clock)

    def ask(day: date = REPORT_DAY) -> dict:
        return asyncio.run(client.panel("AMD", day))

    ask()
    ask()
    assert len(service.requests) == 1
    clock.now += analystdb.KEEP_S - 1
    ask()
    assert len(service.requests) == 1
    ask(date(2026, 11, 5))
    assert len(service.requests) == 2
    clock.now += 2
    assert ask()["state"] == "ok"
    assert len(service.requests) == 3


def test_after_a_failure_analystdb_is_left_alone_for_a_minute():
    clock = Clock()
    service = Service({"/consensus/AMD": httpx.ConnectError("refused")})
    client = service.client(clock=clock)
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "down"
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "down"
    assert len(service.requests) == 1
    # It comes back, and is asked again once the minute is up.
    service.answers["/consensus/AMD"] = saved("consensus_AMD")
    clock.now += analystdb.QUIET_S - 1
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "down"
    clock.now += 2
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "ok"
    assert len(service.requests) == 2


def test_the_side_panel_asks_again_even_while_reports_leave_analystdb_alone():
    # Opened on purpose, and answered off the request loop, the side panel's view never waits
    # out the minute: its Try again really asks again.
    clock = Clock()
    service = Service()
    service.answers["/consensus/AMD"] = httpx.ConnectError("refused")
    client = service.client(clock=clock)
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "down"
    service.answers["/consensus/AMD"] = saved("consensus_AMD")
    assert asyncio.run(client.view("AMD", REPORT_DAY))["state"] == "ok"
    assert asyncio.run(client.panel("AMD", REPORT_DAY))["state"] == "ok"


# --- the full view ------------------------------------------------------------------------------


def by_slug(view: dict) -> dict[str, dict]:
    return {f["firm_slug"]: f for f in view["firms"]}


def test_the_view_has_the_panels_figures_and_every_firm():
    view = view_of(Service())
    assert view["state"] == "ok" and view["n_firms"] == 38 and len(view["firms"]) == 38
    assert view["asof_text"] == "6 Nov 2026"
    assert view["firms_note"] is None and view["changes_note"] is None
    assert view["check_note"] is None


def test_each_firm_carries_its_track_record_matched_by_slug():
    view = view_of(Service())
    assert view["ranked_of"] == 77
    assert view["tracks_asof_text"] == "7 Nov 2026"
    ubs = by_slug(view)["ubs"]
    assert ubs["firm"] == "UBS" and ubs["label"] == "Buy" and ubs["side"] == "buy"
    assert ubs["target"] == 700.0 and ubs["date"] == "2026-11-04"
    assert ubs["rank"] == 38 and ubs["avg_excess"] == pytest.approx(-0.00537812494477315)
    assert ubs["target_text"] == "$700" and ubs["date_text"] == "4 Nov 2026"
    assert ubs["rank_text"] == "#38 of 77" and ubs["excess_text"] == "−0.5%"
    assert by_slug(view)["jp-morgan"]["side"] == "hold"


def test_a_firm_without_a_rank_is_not_ranked():
    firms = by_slug(view_of(Service()))
    # Ranked firms need 50 closed rating calls; this one has fewer.
    assert firms["roth-capital"]["rank"] is None
    assert firms["roth-capital"]["avg_excess"] is not None
    # Under 20 calls a firm isn't in the scorecards at all.
    assert firms["stonex"]["rank"] is None and firms["stonex"]["avg_excess"] is None
    assert firms["stonex"]["rank_text"] == "not ranked"
    assert firms["stonex"]["excess_text"] == "not enough data"


def test_a_track_record_too_short_to_judge_is_not_enough_data():
    cards = saved("scorecards_firms")
    for row in cards["data"]:
        if row["firm_slug"] == "ubs":
            row["avg_excess"] = None
        if row["firm_slug"] == "jp-morgan":
            row["avg_excess"] = {"n": 12, "insufficient_data": True}
    service = Service()
    service.answers["/scorecards/firms"] = cards
    firms = by_slug(view_of(service))
    assert firms["ubs"]["avg_excess"] is None and firms["ubs"]["rank"] == 38
    assert firms["jp-morgan"]["avg_excess"] is None
    assert "not enough data" in firms["jp-morgan"]["readout"]


def test_the_track_records_are_asked_for_firms_with_20_calls_or_more():
    service = Service()
    view_of(service)
    request = next(r for r in service.requests if r.url.path == "/scorecards/firms")
    assert dict(request.url.params) == {"min_calls": "20"}


def test_recent_changes_are_the_20_latest_up_to_the_reports_day():
    service = Service()
    view = view_of(service)
    request = next(r for r in service.requests if r.url.path == "/events/AMD")
    assert dict(request.url.params) == {"until": "2026-11-06", "limit": "20"}
    assert len(view["changes"]) == 20
    first = view["changes"][0]
    keys = ("date", "firm", "action", "action_label", "from_label", "to_label")
    assert {k: first[k] for k in (*keys, "target_prior", "target_current")} == {
        "date": "2026-11-04",
        "firm": "UBS",
        "action": "main",
        "action_label": "Maintained",
        "from_label": "Buy",
        "to_label": "Buy",
        "target_prior": 730.0,
        "target_current": 700.0,
    }
    assert first["date_text"] == "4 Nov 2026" and first["rating_text"] == "Buy"
    assert first["target_text"] == "$730 → $700"
    assert (
        first["readout"]
        == "UBS maintained Buy and cut its target from $730.00 to $700.00 on 4 Nov 2026."
    )


def test_upgrades_and_downgrades_are_named_in_words():
    events = saved("events_AMD")
    items = events["data"]["items"]
    items[0].update(action="up", from_label="Neutral", to_label="Buy", target_prior=None)
    items[1].update(action="down", from_label="Buy", to_label="Hold")
    items[2].update(action="init", from_label=None, to_label="Outperform", target_prior=None)
    service = Service()
    service.answers["/events/AMD"] = events
    changes = view_of(service)["changes"]
    assert [c["action_label"] for c in changes[:3]] == ["Upgrade", "Downgrade", "Initiated"]
    assert (
        changes[0]["readout"]
        == "UBS upgraded it from Neutral to Buy and set a $700.00 target on 4 Nov 2026."
    )
    assert changes[2]["readout"].startswith("Morgan Stanley started coverage at Outperform")


def test_the_trust_check_compares_our_targets_with_s_and_p_globals():
    check = view_of(Service())["check"]
    assert check["supplier"] == "S&P Global" and check["fetched_text"] == "6 Nov 2026"
    rows = {r["measure"]: r for r in check["rows"]}
    assert list(rows) == [
        "target_mean",
        "target_median",
        "target_high",
        "target_low",
        "buy_side",
        "hold",
        "sell_side",
        "n_with_target",
    ]
    mean = rows["target_mean"]
    assert mean["label"] == "Average target" and mean["money"] is True
    assert mean["ours"] == 587.92 and mean["theirs"] == pytest.approx(650.0083)
    assert mean["diff_fraction"] == pytest.approx(-0.0955) and mean["within_tolerance"] is False
    assert (mean["ours_text"], mean["theirs_text"], mean["gap_text"]) == (
        "$587.92",
        "$650.01",
        "−9.6%",
    )
    assert (rows["buy_side"]["ours_text"], rows["buy_side"]["gap_text"]) == ("32", "−11")
    assert mean["tolerance_text"] == "3%" and rows["buy_side"]["tolerance_text"] == "3-firm"
    assert mean["readout"] == (
        "Average target: analystdb $587.92, S&P Global $650.01, 9.6% lower; "
        "outside the 3% tolerance."
    )
    assert rows["sell_side"]["within_tolerance"] is True and rows["sell_side"]["money"] is False
    assert rows["buy_side"]["readout"] == (
        "Buy-side firms: analystdb 32, S&P Global 43, 11 fewer; outside the 3-firm tolerance."
    )


def test_a_company_s_and_p_global_has_no_figures_for_says_so():
    answer = saved("crosscheck_AMD")
    answer["data"] = [row for row in answer["data"] if row["supplier"] != "spglobal"]
    service = Service()
    service.answers["/crosscheck/AMD"] = answer
    view = view_of(service)
    assert view["check"] is None
    assert view["check_note"] == "S&P Global has no figures for AMD as of 6 Nov 2026."


@pytest.mark.parametrize(
    ("path", "part", "note"),
    [
        (
            "/scorecards/firms",
            "firms_note",
            "Track records didn’t load: analystdb isn’t answering.",
        ),
        ("/events/AMD", "changes_note", "Recent changes didn’t load: analystdb isn’t answering."),
        (
            "/crosscheck/AMD",
            "check_note",
            "The trust check didn’t load: analystdb isn’t answering.",
        ),
    ],
)
def test_one_part_that_fails_leaves_the_rest_of_the_view(path, part, note):
    service = Service()
    service.answers[path] = httpx.Response(500, text="boom")
    view = view_of(service)
    assert view["state"] == "ok" and view[part] == note
    assert len(view["firms"]) == 38
    if part == "firms_note":
        assert view["ranked_of"] is None
        assert all(f["rank"] is None and f["avg_excess"] is None for f in view["firms"])
        assert {(f["rank_text"], f["excess_text"]) for f in view["firms"]} == {("—", "—")}
    if part == "changes_note":
        assert view["changes"] is None
    if part == "check_note":
        assert view["check"] is None


def test_without_the_ratings_the_view_is_the_quiet_line():
    service = Service()
    service.answers["/consensus/AMD"] = httpx.ConnectError("refused")
    view = view_of(service)
    assert view["state"] == "down" and view["note"] == DOWN
    assert view["firms"] is None and view["changes"] is None and view["check"] is None


def test_each_firm_reads_out_its_rating_target_and_record():
    firms = by_slug(view_of(Service()))
    assert firms["ubs"]["readout"] == (
        "UBS rates it Buy with a $700.00 target (4 Nov 2026). Track record: #38 of 77 ranked "
        "firms; its rating calls averaged −0.5% against the S&P 500."
    )
    assert firms["stonex"]["readout"].endswith(
        "Track record: not ranked; not enough data to judge its calls."
    )
