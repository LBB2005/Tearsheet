"""replay-dig (dig/replay.py): a snapshot rebuilt from the bytes it stored and the prices up to
its close is identical; a changed byte shows up as a difference."""

from __future__ import annotations

import asyncio
import gzip

import httpx
import pytest

from tearsheet import cli
from tearsheet.config import Settings
from tearsheet.data import membership
from tearsheet.dig import snapshot as snap
from tearsheet.dig.replay import StoredHttp, replay_snapshot
from tearsheet.dig.target import target
from tearsheet.http import Fetched, HTTPFailure, redact_url
from tearsheet.methodology import load
from tests.test_dig_news import FIXTURES
from tests.test_dig_snapshot import ANSWERS, NOW, Service, seed_stock
from tests.test_watchlist import AAPL


@pytest.fixture
def stock(database):
    return seed_stock(database.conn)


class StoringHttp:
    """Answers news from the fixture and stores it, as HttpClient does."""

    def __init__(self, rawstore, run_id):
        self.rawstore, self.run_id = rawstore, run_id

    async def fetch(self, service, url, *, kind, expect="json", params=None):
        full = str(httpx.URL(url, params=params)) if params else url
        body = (FIXTURES / "massive_news_ok.json").read_bytes()
        raw = self.rawstore.put(body, redact_url(full), service, "application/json", self.run_id)
        return Fetched(full, 200, "application/json", body, raw)


class NoLive:
    async def form4_amounts(self, cik, *, today):
        raise HTTPFailure("sec", "https://www.sec.gov/x", "HTTP 503", 503)

    async def macro(self, day):
        return {}


def saved_snapshot(conn, rawstore) -> dict:
    holdings = membership.load_bundled()
    sid = snap.new_snapshot_id(AAPL, NOW)
    sources = snap.Sources(
        http=StoringHttp(rawstore, sid),
        live=NoLive(),
        settings=Settings(conn),
        rawstore=rawstore,
        analystdb=Service(ANSWERS).client(),
        fred_key=False,
        massive_key=True,
    )
    built = asyncio.run(
        snap.build(
            conn,
            rawstore.raw_dir,
            holdings,
            load(),
            target(conn, AAPL, holdings),
            sources,
            now=NOW,
            snapshot_id=sid,
        )
    )
    snap.save(conn, built)
    return built


def test_a_fresh_snapshot_replays_identically(stock, rawstore):
    built = saved_snapshot(stock, rawstore)
    assert {p: built[p]["state"] for p in ("news", "analysts", "rates", "insiders")} == {
        "news": "ok",
        "analysts": "ok",
        "rates": "off",
        "insiders": "down",
    }
    result = replay_snapshot(stock, rawstore.raw_dir, built["snapshot_id"])
    assert result.differences == []
    assert result.compared == ["sector", "market", "analysts", "news"]


def test_a_changed_stored_byte_is_a_difference(stock, rawstore):
    built = saved_snapshot(stock, rawstore)
    row = stock.execute(
        "SELECT raw_hash FROM fetch_log WHERE run_id = ? AND provider = 'massive'",
        (built["snapshot_id"],),
    ).fetchone()
    doctored = (FIXTURES / "massive_news_ok.json").read_text().replace("raises its", "cuts its")
    rawstore.path_for(row[0]).write_bytes(gzip.compress(doctored.encode()))
    result = replay_snapshot(stock, rawstore.raw_dir, built["snapshot_id"])
    assert result.differences == [
        "news.items[0].title: stored 'Testco raises its yearly outlook',"
        " rebuilt 'Testco cuts its yearly outlook'"
    ]


def test_stored_http_serves_only_this_snapshots_bytes(database, rawstore):
    rawstore.put(
        b'{"x":1}',
        "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10",
        "fred",
        "application/json",
        "dig-1",
    )
    http = StoredHttp(database.conn, rawstore.raw_dir, "dig-1")
    got = asyncio.run(
        http.fetch(
            "fred",
            "https://api.stlouisfed.org/fred/series/observations",
            kind="series",
            params={"series_id": "DGS10", "api_key": "SECRET"},
        )
    )
    assert got.body == b'{"x":1}'
    other = StoredHttp(database.conn, rawstore.raw_dir, "dig-2")
    try:
        asyncio.run(
            other.fetch(
                "fred",
                "https://api.stlouisfed.org/fred/series/observations",
                kind="s",
                params={"series_id": "DGS10"},
            )
        )
    except HTTPFailure as exc:
        assert "wasn't stored" in str(exc)
    else:
        raise AssertionError("served bytes another snapshot stored")


def test_replay_dig_all_from_the_command_line(stock, rawstore, database, capsys):
    data = str(database.path.parent)
    assert cli.main(["--data-dir", data, "replay-dig", "--all"]) == 0
    assert "No Dig deeper snapshots to replay." in capsys.readouterr().out
    built = saved_snapshot(stock, rawstore)
    assert cli.main(["--data-dir", data, "replay-dig", "--all"]) == 0
    assert f"Replayed {built['snapshot_id']}: identical" in capsys.readouterr().out
    assert cli.main(["--data-dir", data, "replay-dig", "dig-nope"]) == 2


def saved_take(conn, rawstore, snapshot: dict, *, take_id="take-1-20261110T010000Z-aaaaaa"):
    from tearsheet.dig import take as tk
    from tests.test_dig_take import answer, clean, client, draft

    ai = client(conn, [answer(draft()), answer(clean())])
    written = asyncio.run(
        tk.write_take(
            conn,
            rawstore.raw_dir,
            load(),
            snapshot,
            ai=ai,
            checker=None,
            now=NOW,
            take_id=take_id,
            progress=lambda step: None,
        )
    )
    tk.save(conn, written)
    return written


def test_a_saved_take_is_checked_again_identically(stock, rawstore):
    from tearsheet.dig.replay import replay_take, take_ids

    built = saved_snapshot(stock, rawstore)
    written = saved_take(stock, rawstore, built)
    assert take_ids(stock) == [written.take["take_id"]]
    result = replay_take(stock, rawstore.raw_dir, written.take["take_id"])
    assert result.identical, result.differences
    assert result.compared == ["take"]


def test_a_changed_stored_draft_is_a_difference(stock, rawstore):
    import json

    from tearsheet.dig.replay import replay_take

    built = saved_snapshot(stock, rawstore)
    written = saved_take(stock, rawstore, built)
    drafts = json.loads(json.dumps(written.drafts))
    drafts["first"]["answers"][0]["sentences"][0]["text"] = "Revenue grew 12% last year."
    with stock:
        stock.execute(
            "INSERT INTO dig_takes VALUES ('take-tampered', ?, ?, ?, ?, '{}', ?, ?)",
            (
                built["cik"],
                built["snapshot_id"],
                built["report_id"],
                written.take["created_at"],
                json.dumps(drafts),
                json.dumps({**written.take, "take_id": "take-tampered"}),
            ),
        )
    result = replay_take(stock, rawstore.raw_dir, "take-tampered")
    assert not result.identical
    assert any(
        d.startswith("take.removed") or d.startswith("take.answers") for d in result.differences
    )


def test_replay_dig_all_checks_the_takes_too(stock, rawstore, database, capsys):
    data = str(database.path.parent)
    built = saved_snapshot(stock, rawstore)
    written = saved_take(stock, rawstore, built)
    assert cli.main(["--data-dir", data, "replay-dig", "--all"]) == 0
    out = capsys.readouterr().out
    assert f"Replayed {built['snapshot_id']}: identical" in out
    assert f"Re-checked {written.take['take_id']}: identical." in out
