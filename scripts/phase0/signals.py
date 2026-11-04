"""Capture Claude Code's signed-out output for the error table (design item 12).

    uv run --project engine python scripts/phase0/signals.py

It runs one call with an empty temporary config folder (CLAUDE_CONFIG_DIR), so your own
sign-in is untouched, and saves what Claude Code says as a fixture in
engine/tests/fixtures/ai/. Usage-limit messages are saved whenever one happens, in each data
folder's logs/ai-signals/; copy them into the same fixtures folder.

    uv run --project engine python scripts/phase0/signals.py --alphavantage

also records the shape of Alpha Vantage's answers (two of the free plan's 25 daily calls):
a normal company overview, and a deliberately wrong request, to confirm the error fields
that `http.py` treats as "not data" (ALPHAVANTAGE_ERROR_FIELDS).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
from datetime import date

from _common import HERE, fail, open_workspace, stamp, write_results

from tearsheet import config
from tearsheet.ai import connector_for
from tearsheet.ai.client import AIAuthError, AIError, CallRequest, Source, classify_error
from tearsheet.ai.schemas import LockdownProbe
from tearsheet.http import ALPHAVANTAGE_ERROR_FIELDS, HttpClient, HTTPFailure

FIXTURES = HERE.parent.parent / "engine" / "tests" / "fixtures" / "ai"
ALPHAVANTAGE_URL = "https://www.alphavantage.co/query"


async def alphavantage() -> int:
    key = config.get_key("alphavantage")
    if not key:
        fail(
            "Save your Alpha Vantage key first: uv run --project engine tearsheet-engine set-key alphavantage"
        )
    ws = open_workspace("signals", None)
    run_id = f"phase0-alphavantage-{stamp()}"
    shapes = {}
    try:
        async with HttpClient(ws.rawstore, run_id, settings=ws.settings) as http:
            for name, params in (
                ("overview", {"function": "OVERVIEW", "symbol": "IBM"}),
                ("wrong request", {"function": "TEARSHEET_TEST", "symbol": "IBM"}),
            ):
                try:
                    fetched = await http.fetch(
                        "alphavantage",
                        ALPHAVANTAGE_URL,
                        kind=name,
                        params={**params, "apikey": key},
                    )
                    data = fetched.json()
                    shapes[name] = {"accepted_as_data": True, "fields": sorted(data)[:40]}
                except HTTPFailure as exc:
                    shapes[name] = {"accepted_as_data": False, "reason": str(exc)}
    finally:
        ws.close()
    path = write_results(
        "alphavantage", {"error_fields_believed": ALPHAVANTAGE_ERROR_FIELDS, "answers": shapes}
    )
    for name, shape in shapes.items():
        print(f"{name}: {shape}")
    print(f"Full results: {path}")
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--alphavantage", action="store_true", help="record Alpha Vantage's answer shapes instead"
    )
    if parser.parse_args().alphavantage:
        return await alphavantage()
    ws = open_workspace("signals", None)
    try:
        with tempfile.TemporaryDirectory(prefix="tearsheet-signed-out-") as empty:
            connector = connector_for("claude", ws.settings, extra_env={"CLAUDE_CONFIG_DIR": empty})
            request = CallRequest(
                task="signals",
                instructions="Summarise the source in one sentence.",
                sources=[Source("p1", "Revenue rose in every region.")],
                schema=LockdownProbe,
                model=connector.models["extract"],
            )
            try:
                await connector.call(request)
            except AIError as exc:
                raw = exc.raw or str(exc)
            else:
                fail(
                    "Claude Code still answered with an empty config folder, so it isn't signed "
                    "out there and nothing was captured. Record this in docs/phase0-results.md."
                )
            finally:
                connector.close()
    finally:
        ws.close()

    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / "claude_signed_out_recorded.json"
    fixture = {
        "tool": "claude",
        "signal": raw,
        "expected": "AIAuthError",
        "source": f"recorded by scripts/phase0/signals.py on {date.today()}",
    }
    path.write_text(json.dumps(fixture, indent=2) + "\n")
    matched = classify_error("claude", raw)
    print(f"Saved {path}")
    print(f"Claude Code said: {raw[:300]}")
    if isinstance(matched, AIAuthError):
        print("The error table already reads this as signed out.")
    else:
        print(
            f"The error table reads this as {type(matched).__name__}, not signed out. Add a "
            "pattern to ERROR_TABLE in engine/src/tearsheet/ai/client.py, then run the tests."
        )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
