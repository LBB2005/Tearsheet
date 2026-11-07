"""Jobs beside the request loop: grading answers off the loop, so look-ups and settings answer
while it fetches prices, and no run starts while it goes; and the order of a stopped run's notes."""

from __future__ import annotations

import asyncio
import json
from datetime import date

from tearsheet import config
from tearsheet.ai.client import AIUsageLimit
from tests.test_pipeline import clean_ai
from tests.test_protocol import Harness, run


def _slow_grading(monkeypatch, calls: list[str], busy):
    import tearsheet.grading as grading

    gate: dict[str, asyncio.Event] = {}

    async def slow(conn, data, rules, *, now, backup_dir):
        calls.append("busy" if busy() else "free")
        await gate["open"].wait()
        return {"graded": 2}

    monkeypatch.setattr(grading, "grade_job", slow)
    return gate


def _send(h: Harness, id_: int, method: str, params: dict | None = None):
    return h.server.handle(
        json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
    )


def test_look_ups_answer_while_grading_and_runs_wait_for_it(tmp_path, monkeypatch):
    h = Harness(tmp_path)
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await _send(h, 1, "grade_due")
        await asyncio.sleep(0.01)
        pending = [m for m in h.messages if m.get("id") == 1]
        hit = await h.call("search_companies", {"query": "nvda"}, id_=2)
        settings = await h.call("get_settings", {}, id_=3)
        refused = {
            method: await h.call(method, params, id_=i)
            for i, (method, params) in enumerate(
                [
                    ("run_report", {"query": "T0"}),
                    ("resume", {"run_id": "run-x"}),
                    ("run_safety_check", {"tool": "claude"}),
                    ("fetch_history", {"report_id": "rep-x"}),
                ],
                start=4,
            )
        }
        gate["open"].set()
        await h.server.wait_for_grading()
        graded = [m for m in h.messages if m.get("id") == 1]
        after = await h.call("run_report", {"query": "T0"}, id_=9)
        await h.finish()
        return pending, hit, settings, refused, graded, after

    pending, hit, settings, refused, graded, after = run(go())
    assert pending == []  # grading was still going
    assert hit["result"][0]["ticker"] == "NVDA"
    assert "keys" in settings["result"]
    for method, reply in refused.items():
        assert reply["error"]["data"]["code"] == "GRADING_IN_PROGRESS", method
        assert "grading" in reply["error"]["message"].lower()
    assert graded == [{"jsonrpc": "2.0", "id": 1, "result": {"graded": 2}}]
    assert after["result"]["ticker"] == "T0"  # runs start again once grading is done
    h.server.close()


def test_grading_asked_for_during_a_run_waits_for_it_off_the_loop(tmp_path, monkeypatch):
    h = Harness(tmp_path, delay_s=0.02)  # a run slow enough to still be going
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        gate["open"].set()
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await _send(h, 2, "grade_due")
        hit = await h.call("search_companies", {"query": "nvda"}, id_=3)
        running = h.server._busy()
        await h.finish()
        await h.server.wait_for_grading()
        return hit, running

    hit, running = run(go())
    assert running and hit["result"][0]["ticker"] == "NVDA"  # answered while the run went on
    assert calls == ["free"]  # grading began only after the run
    assert next(m for m in h.messages if m.get("id") == 2)["result"] == {"graded": 2}
    h.server.close()


def test_a_second_grade_due_shares_the_grading_under_way(tmp_path, monkeypatch):
    h = Harness(tmp_path)
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await _send(h, 1, "grade_due")
        await _send(h, 2, "grade_due")
        await asyncio.sleep(0.01)
        gate["open"].set()
        await h.server.wait_for_grading()
        await asyncio.sleep(0.01)

    run(go())
    assert calls == ["free"]
    assert [m["result"] for m in h.messages if m.get("id") in (1, 2)] == [{"graded": 2}] * 2
    h.server.close()


def test_a_stopped_run_says_so_before_its_report_so_far(tmp_path):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    order = [m["method"] for m in h.messages if m.get("method") in ("run_failed", "report_ready")]
    assert order == ["run_failed", "report_ready"]
    assert h.notes("run_failed")[0]["step"] == "narrate"
    h.server.close()


# --- the full price history and the key checks, off the loop ----------------------------------


class _SlowHttp:
    """Massive, slowed: every call waits for the gate (a first full download is about a minute
    of calls at the plan's pace)."""

    def __init__(self):
        from tests.test_server_lookups import FakeHttp

        self.inner = FakeHttp()
        self.gate = asyncio.Event()

    async def fetch(self, *args, **kwargs):
        await self.gate.wait()
        return await self.inner.fetch(*args, **kwargs)


def _history_harness(tmp_path):
    from contextlib import asynccontextmanager

    from tests.test_charts import seed

    http = _SlowHttp()

    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        yield http

    config.set_key("massive", "test-massive-key")
    h = Harness(tmp_path)
    h.server.http_factory = http_factory
    seed(h.server.db.conn)
    with h.server.db.conn:
        h.server.db.conn.execute(
            "INSERT INTO step_outputs VALUES ('run-1', 'resolve', '{\"ticker\": \"ABC\"}')"
        )
        # A second report of the same company.
        h.server.db.conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
            " VALUES ('rep-2', 'run-1', '2026-10-31T01:00:00+00:00', 1)"
        )
    return h, http


def _reply(h: Harness, id_: int) -> dict | None:
    return next((m for m in h.messages if m.get("id") == id_), None)


def test_look_ups_answer_while_a_history_download_goes_and_runs_wait_for_it(tmp_path):
    h, http = _history_harness(tmp_path)

    async def go():
        await h.server.start()
        # handle() returns at once: the download is answered off the loop.
        await asyncio.wait_for(_send(h, 1, "fetch_history", {"report_id": "rep-1"}), 1)
        await asyncio.sleep(0.01)
        pending = _reply(h, 1)
        companies = await asyncio.wait_for(h.call("list_companies", id_=2), 1)
        hit = await asyncio.wait_for(h.call("search_companies", {"query": "nvda"}, id_=3), 1)
        settings = await asyncio.wait_for(h.call("get_settings", id_=4), 1)
        refused_run = await h.call("run_report", {"query": "T0"}, id_=5)
        refused_resume = await h.call("resume", {"run_id": "run-1"}, id_=6)
        http.gate.set()
        await h.server.wait_for_grading()
        done = _reply(h, 1)
        after = await h.call("run_report", {"query": "T0"}, id_=7)
        await h.finish()
        return pending, companies, hit, settings, refused_run, refused_resume, done, after

    pending, companies, hit, settings, refused_run, refused_resume, done, after = run(go())
    assert pending is None  # the download was still going
    assert companies["result"][0]["report_id"] == "rep-2"
    assert hit["result"][0]["ticker"] == "NVDA"
    assert "keys" in settings["result"]
    for refused in (refused_run, refused_resume):
        assert refused["error"]["data"]["code"] == "HISTORY_DOWNLOADING"
        assert "price history" in refused["error"]["message"]
    assert done["result"]["first_date"] <= "2000-01-05"
    assert after["result"]["ticker"] == "T0"  # runs start again once the download is done
    h.server.close()


def test_two_history_downloads_for_one_company_share_one(tmp_path):
    h, http = _history_harness(tmp_path)

    async def go():
        await h.server.start()
        await asyncio.wait_for(_send(h, 1, "fetch_history", {"report_id": "rep-1"}), 1)
        await asyncio.wait_for(_send(h, 2, "fetch_history", {"report_id": "rep-2"}), 1)
        await asyncio.sleep(0.01)
        http.gate.set()
        await h.server.wait_for_grading()

    run(go())
    first, second = _reply(h, 1), _reply(h, 2)
    assert first["result"] == second["result"] and first["result"]["days"] >= 2
    # One download's calls: the company's splits and two pages of dividends, SPY's three, and
    # the company's bars.
    assert len(http.inner.calls) == 7
    h.server.close()


def test_a_key_check_answers_off_the_loop(tmp_path, monkeypatch):
    import tearsheet.setup_checks as setup_checks

    gate: dict[str, asyncio.Event] = {}

    async def slow_check(http, service, key):
        await gate["open"].wait()
        return f"{service} answered"

    monkeypatch.setattr(setup_checks, "check_key", slow_check)
    h = Harness(tmp_path)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await asyncio.wait_for(
            _send(h, 1, "check_key", {"service": "massive", "key": " new-key\n"}), 1
        )
        await asyncio.sleep(0.01)
        pending = _reply(h, 1)
        hit = await asyncio.wait_for(h.call("search_companies", {"query": "nvda"}, id_=2), 1)
        gate["open"].set()
        await h.server.wait_for_grading()
        return pending, hit

    pending, hit = run(go())
    assert pending is None
    assert hit["result"][0]["ticker"] == "NVDA"
    assert _reply(h, 1)["result"] == {"proof": "massive answered"}
    from tearsheet import config

    assert config.get_key("massive") == "new-key"
    h.server.close()


def test_a_stopped_run_names_the_step_it_stopped_at(tmp_path):
    """A usage limit during extract says extract, though the pipeline goes on to fill in the
    numbers, check and save the report so far."""

    def limited(request):
        if request.task == "extract":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    failed = h.notes("run_failed")
    assert len(failed) == 1 and failed[0]["code"] == "USAGE_LIMIT"
    assert failed[0]["step"] == "extract"
    started = [p["step_name"] for p in h.notes("progress") if p["state"] == "started"]
    assert started[-1] == "save"  # the steps after the stop still ran
    h.server.close()


def _backfill_harness(tmp_path, monkeypatch, *, delay_s=0.0):
    import tearsheet.data.market as market
    import tearsheet.server as server_module

    monkeypatch.setattr(server_module, "BACKFILL_POLL_S", 0.005)
    config.set_key("massive", "test-key")
    h = Harness(tmp_path, delay_s=delay_s)
    h.server.backfill_enabled = True
    h.server.keep_current_every_s = None  # one pass, not the open app's half-hourly checks
    seen: list[str] = []

    async def fake_backfill(http, rawstore, store, wanted, *, end, gate, progress, **_):
        seen.append("busy" if h.server._others_running() else "free")
        return market.BackfillResult(
            sessions=1, calls=1, reused=0, ready=len(wanted), wanted=len(wanted)
        )

    monkeypatch.setattr(market, "backfill", fake_backfill)
    return h, seen


def test_the_backfill_waits_for_a_report_and_never_blocks_it(tmp_path, monkeypatch):
    h, seen = _backfill_harness(tmp_path, monkeypatch, delay_s=0.02)

    async def go():
        await h.server.start()
        reply = await h.call("run_report", {"query": "T0"})
        await h.finish()
        result = await asyncio.wait_for(h.server.backfill_job, 5)
        return reply, result

    reply, result = run(go())
    assert reply["result"]["ticker"] == "T0"  # the report started at once
    assert seen == ["free"]  # the backfill went only after it
    assert result["ready"] == result["wanted"]
    assert config.Settings(h.server.db.conn).get("prices_backfill_completed")
    h.server.close()
    # Once it has covered every member, the next start only keeps prices current.
    again = Harness(tmp_path)
    again.server.backfill_enabled = True
    again.server.keep_current_every_s = None

    async def restart():
        await again.server.start()
        return await asyncio.wait_for(again.server.backfill_job, 5)

    assert run(restart()) is None and seen == ["free"]  # no second backfill
    again.server.close()


def test_the_backfill_stays_off_when_switched_off_or_with_no_key(tmp_path, monkeypatch):
    h, seen = _backfill_harness(tmp_path, monkeypatch)
    config.Settings(h.server.db.conn).set("prices_backfill", "off")
    run(h.server.start())
    assert h.server.backfill_job is None
    h.server.close()
    config.set_key("massive", "")
    other = Harness(tmp_path / "other")
    other.server.backfill_enabled = True
    run(other.server.start())
    assert other.server.backfill_job is None and seen == []
    other.server.close()


def test_saving_the_massive_key_starts_the_price_download_at_once(tmp_path, monkeypatch):
    h, seen = _backfill_harness(tmp_path, monkeypatch)
    config.set_key("massive", "")

    async def go():
        await h.server.start()
        before = h.server.backfill_job
        reply = await h.call("set_key", {"service": "massive", "key": "new-key"})
        result = await asyncio.wait_for(h.server.backfill_job, 5)
        return before, reply, result

    before, reply, result = run(go())
    assert before is None  # no key yet when the app opened
    assert reply["result"] == {"ok": True}
    assert seen == ["free"] and result["ready"] == result["wanted"]
    h.server.close()


def test_the_open_app_adds_newly_closed_sessions(tmp_path, monkeypatch):
    import tearsheet.data.market as market
    from tearsheet.data.membership import stored_or_bundled
    from tearsheet.data.prices import PriceStore, last_completed_session, previous_session
    from tests.test_pipeline import NOW

    h, _ = _backfill_harness(tmp_path, monkeypatch)
    conn = h.server.db.conn
    wanted = market.wanted_members(stored_or_bundled(conn))
    market.record_backfill(config.Settings(conn), wanted, date(2026, 11, 2))  # done earlier
    end = last_completed_session(NOW)
    behind = previous_session(end)
    store = PriceStore(conn)
    for cik in (320193, 789019):
        store.store_bars(cik, "", {"results": [{"t": _ms(behind), "c": 1.0}]}, raw_hash="x")
    asked = []

    async def fake_top_up(http, rawstore, store, have, days, *, tally=None):
        asked.append((sorted(have), days))
        return {}

    monkeypatch.setattr(market, "top_up", fake_top_up)

    async def go():
        await h.server.start()
        await asyncio.wait_for(h.server.backfill_job, 5)

    run(go())
    assert asked == [(["AAPL", "MSFT"], [end])]
    h.server.close()


def _ms(day) -> int:
    from datetime import datetime

    from tearsheet.http import EASTERN

    return int(datetime(day.year, day.month, day.day, tzinfo=EASTERN).timestamp() * 1000)


def test_a_passed_key_check_starts_the_price_download(tmp_path, monkeypatch):
    # Setup and Settings save the Massive key through check_key.
    import tearsheet.setup_checks as checks

    h, seen = _backfill_harness(tmp_path, monkeypatch)
    config.set_key("massive", "")

    async def passes(http, service, key):
        return "ok"

    monkeypatch.setattr(checks, "check_key", passes)

    async def go():
        await h.server.start()
        before = h.server.backfill_job
        reply = await h.call("check_key", {"service": "massive", "key": "new-key"})
        result = await asyncio.wait_for(h.server.backfill_job, 5)
        return before, reply, result

    before, reply, result = run(go())
    assert before is None and "result" in reply
    assert seen == ["free"] and result["ready"] == result["wanted"]
    h.server.close()


def test_switching_the_backfill_off_stops_it_at_its_next_call(tmp_path, monkeypatch):
    import tearsheet.data.market as market

    h, _ = _backfill_harness(tmp_path, monkeypatch)
    calls = []

    async def stops(http, rawstore, store, wanted, *, end, gate, progress, **_):
        calls.append("first")
        await gate()
        config.Settings(h.server.db.conn).set("prices_backfill", "off")  # from the terminal
        await gate()
        calls.append("never")

    monkeypatch.setattr(market, "backfill", stops)

    async def go():
        await h.server.start()
        return await asyncio.wait_for(h.server.backfill_job, 5)

    assert run(go()) is None
    assert calls == ["first"]
    assert config.Settings(h.server.db.conn).get("prices_backfill_status") == "switched off"
    h.server.close()


# --- the price download in get_settings (Settings' Data keys page) ---------------------------


def _price_download(h: Harness, id_: int = 90):
    async def ask():
        return (await h.call("get_settings", id_=id_))["result"]["price_download"]

    return ask()


def test_settings_say_the_price_download_waits_for_a_massive_key(tmp_path, monkeypatch):
    from tearsheet.protocol import PriceDownload

    h, seen = _backfill_harness(tmp_path, monkeypatch)
    config.set_key("massive", "")

    async def go():
        await h.server.start()
        return await _price_download(h)

    shown = run(go())
    PriceDownload.model_validate(shown)
    assert shown["state"] == "no_key" and seen == []
    assert shown["companies"] > 400 and shown["companies_ready"] == 0  # SPY isn't counted
    h.server.close()


def test_settings_follow_the_price_download_as_it_goes_and_pauses_for_a_report(
    tmp_path, monkeypatch
):
    import tearsheet.data.market as market
    from tearsheet.data.prices import last_completed_session
    from tests.test_pipeline import NOW

    h, _ = _backfill_harness(tmp_path, monkeypatch, delay_s=0.02)
    # An earlier pass stopped at 10; this one reads its stored answers again from the start.
    config.Settings(h.server.db.conn).set_internal(market.STATUS_SETTING, "10 of 295 sessions")
    inside, count, counted, release = (asyncio.Event() for _ in range(4))

    async def slow_backfill(http, rawstore, store, wanted, *, end, gate, progress, **_):
        inside.set()
        await count.wait()
        tally = market.Tally()
        tally.made = 140
        progress(120, 295, tally)
        counted.set()
        await release.wait()
        return market.BackfillResult(sessions=295, calls=300, reused=0, ready=2, wanted=2)

    monkeypatch.setattr(market, "backfill", slow_backfill)

    async def no_top_up(*args, **kwargs):
        return {}

    monkeypatch.setattr(market, "top_up", no_top_up)
    # Apple has the whole window; Microsoft only its last session.
    _store_window(h, {320193: "whole", 789019: "last"}, end=last_completed_session(NOW))

    async def go():
        await h.server.start()
        await asyncio.wait_for(inside.wait(), 5)
        starting = await _price_download(h, 1)
        count.set()
        await asyncio.wait_for(counted.wait(), 5)
        going = await _price_download(h, 2)
        await h.call("run_report", {"query": "T0"}, id_=3)
        paused = await _price_download(h, 4)
        await h.finish()
        after_report = await _price_download(h, 5)
        release.set()
        await asyncio.wait_for(h.server.backfill_job, 5)
        done = await _price_download(h, 6)
        return starting, going, paused, after_report, done

    starting, going, paused, after_report, done = run(go())
    assert starting["state"] == "downloading" and starting.get("days_done") is None
    assert going["state"] == "downloading"
    assert (going["days_done"], going["days_total"]) == (120, 295)
    assert paused["state"] == "paused" and paused["paused_for"] == "report"
    assert paused["days_done"] == 120
    assert after_report["state"] == "downloading"
    assert done["state"] == "done" and done["companies_ready"] == 1  # Apple; Microsoft is short
    assert config.Settings(h.server.db.conn).get(market.STATUS_SETTING) == (
        "120 of 295 sessions, 140 calls"
    )
    h.server.close()


def _store_window(h: Harness, spans: dict[int, str], *, end) -> None:
    """Two closes a stock for the whole window (ready() reads only the first and last), or one
    on the last session."""
    import tearsheet.data.market as market
    from tearsheet.data.prices import PriceStore, sessions_between

    first = sessions_between(market.window_start(end), end)[0]
    store = PriceStore(h.server.db.conn)
    for cik, span in spans.items():
        days = (first, end) if span == "whole" else (end,)
        bars = [{"t": _ms(day), "c": 1.0} for day in days]
        store.store_bars(cik, "", {"results": bars}, raw_hash="x")


def test_a_finished_price_download_counts_up_to_the_newest_stored_session(tmp_path, monkeypatch):
    # The app opened after a few days away: every stored close, SPY's too, is a session behind
    # until the top-up catches up, and the companies still count as downloaded.
    import tearsheet.data.market as market
    from tearsheet.data.membership import stored_or_bundled
    from tearsheet.data.prices import SPY_CIK, last_completed_session, previous_session
    from tests.test_pipeline import NOW

    h = Harness(tmp_path)
    conn = h.server.db.conn
    behind = previous_session(last_completed_session(NOW))
    _store_window(h, {320193: "whole", SPY_CIK: "whole"}, end=behind)
    market.record_backfill(
        config.Settings(conn), market.wanted_members(stored_or_bundled(conn)), behind
    )
    shown = run(_price_download(h))
    assert shown["state"] == "done" and shown["companies_ready"] == 1
    h.server.close()


def test_settings_say_why_the_price_download_stopped_in_plain_words(tmp_path, monkeypatch):
    import tearsheet.data.market as market
    from tearsheet.http import HTTPFailure

    h, _ = _backfill_harness(tmp_path, monkeypatch)

    async def refused(http, rawstore, store, wanted, *, end, gate, progress, **_):
        raise HTTPFailure("massive", "https://api.massive.com/v2/x?apiKey=secret", "HTTP 401", 401)

    monkeypatch.setattr(market, "backfill", refused)

    async def go():
        await h.server.start()
        await asyncio.wait_for(h.server.backfill_job, 5)
        return await _price_download(h)

    shown = run(go())
    assert shown["state"] == "stopped"
    assert shown["stopped_because"] == "Massive turned down the key"
    assert "secret" not in json.dumps(h.messages) and "http" not in shown["stopped_because"]
    h.server.close()


def test_settings_say_when_the_price_download_is_off_or_waits_for_the_next_open(
    tmp_path, monkeypatch
):
    h, _ = _backfill_harness(tmp_path, monkeypatch)
    h.server.backfill_enabled = False  # as if the key came from the terminal while the app ran

    async def ask():
        await h.server.start()
        return await _price_download(h)

    assert run(ask())["state"] == "waiting"
    config.Settings(h.server.db.conn).set("prices_backfill", "off")
    assert run(_price_download(h))["state"] == "off"
    h.server.close()


def test_the_price_download_stop_reasons_are_plain_words():
    from tearsheet.http import DailyLimitReached, HTTPFailure
    from tearsheet.server import backfill_stop_reason

    def failure(status):
        return HTTPFailure("massive", "https://api.massive.com/x", "HTTP", status)

    assert backfill_stop_reason(DailyLimitReached("massive", "", "used", 429)).startswith(
        "the day’s Massive allowance"
    )
    assert backfill_stop_reason(failure(None)) == "no answer came from Massive"
    assert backfill_stop_reason(failure(403)) == "the Massive plan doesn’t include these prices"
    assert backfill_stop_reason(failure(429)).startswith("Massive was limiting")
    assert backfill_stop_reason(failure(503)) == "Massive was having trouble"
    assert backfill_stop_reason(failure(200)) == "Massive sent an unreadable answer"
    assert backfill_stop_reason(KeyError("x")).startswith("something went wrong")
