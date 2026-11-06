"""Build engine/tests/fixtures/runs/: stored test runs that CI replays (design item 52).

Two runs on the synthetic test companies, with no AI: a thin slice and a full report. CI runs
`tearsheet-engine replay --all` on them, so a change that moves any number, or the code-written
report text, fails until it is deliberate. Rebuild them only for a deliberate change, together
with a METHOD_CODE_VERSION increase:

    uv run --project engine python scripts/make_test_runs.py
"""

from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from tests.test_replay import NOW, LoggedData  # noqa: E402

from tearsheet import config  # noqa: E402
from tearsheet.data import membership  # noqa: E402
from tearsheet.db import open_database  # noqa: E402
from tearsheet.methodology import load  # noqa: E402
from tearsheet.pipeline import Run  # noqa: E402
from tearsheet.rawstore import RawStore  # noqa: E402

OUT = ROOT / "engine" / "tests" / "fixtures" / "runs"


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    paths = config.Paths(OUT).ensure()
    membership.MIN_ROWS = 1  # the synthetic index has 20 members
    database = open_database(paths.db)
    try:
        rawstore = RawStore(paths.raw, database.conn)
        for mode in ("slice", "full"):
            run_id = f"run-fixture-{mode}"
            run = Run(
                database.conn,
                LoggedData(rawstore, run_id),
                None,
                load(),
                mode=mode,
                now=NOW,
                out_dir=None,
                run_id=run_id,
                rawstore=rawstore,
            )
            result = asyncio.run(run.run("T0"))
            print(f"{run_id}: {result.status}, rating {result.rating}")
        database.conn.execute("PRAGMA journal_mode = DELETE")
        database.conn.execute("VACUUM")
    finally:
        database.close()
    shutil.rmtree(paths.logs, ignore_errors=True)
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"Wrote {OUT} ({size / 1024:.0f} KB).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
