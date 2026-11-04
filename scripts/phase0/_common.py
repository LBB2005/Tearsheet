"""Shared set-up for the Phase 0 scripts (design item 12). These scripts are throwaway.

Each script starts from a new, empty data folder under
`~/Library/Application Support/Tearsheet/phase0/`. It copies two things from the main data
folder: the settings (for the SEC contact email) and the lock-down state, so a tool that
already passed `lockdown-check` isn't checked again. Results go to `scripts/phase0/results/`.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, NoReturn

import yaml

from tearsheet import config
from tearsheet.db import Database, open_database
from tearsheet.rawstore import RawStore

HERE = Path(__file__).resolve().parent
RESULTS_DIR = HERE / "results"


def stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def load_inputs() -> dict[str, Any]:
    return yaml.safe_load((HERE / "inputs.yaml").read_text(encoding="utf-8"))


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(2)


@dataclass
class Workspace:
    paths: config.Paths
    database: Database
    settings: config.Settings
    rawstore: RawStore

    def close(self) -> None:
        self.database.close()


def _seed_from_main(database: Database) -> None:
    main = config.Paths(config.resolve_data_dir(None)).db
    if not main.exists() or main.resolve() == database.path.resolve():
        return
    source = sqlite3.connect(f"{main.resolve().as_uri()}?mode=ro", uri=True)
    try:
        settings = source.execute("SELECT key, value FROM settings").fetchall()
        tools = source.execute("SELECT * FROM tool_versions").fetchall()
        columns = [c[1] for c in source.execute("PRAGMA table_info(tool_versions)")]
    finally:
        source.close()
    with database.conn:
        database.conn.executemany(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", settings
        )
        marks = ", ".join("?" for _ in columns)
        database.conn.executemany(
            f"INSERT OR REPLACE INTO tool_versions ({', '.join(columns)}) VALUES ({marks})", tools
        )


def open_workspace(script: str, data_dir: str | None) -> Workspace:
    """`data_dir` reuses a folder (the SEC script's next-day repeat); otherwise a new one."""
    folder = (
        Path(data_dir).expanduser()
        if data_dir
        else (config.DEFAULT_DATA_DIR / "phase0" / f"{script}-{stamp()}")
    )
    paths = config.Paths(folder).ensure()
    database = open_database(paths.db)
    _seed_from_main(database)
    return Workspace(
        paths, database, config.Settings(database.conn), RawStore(paths.raw, database.conn)
    )


def sec_user_agent(settings: config.Settings) -> str:
    try:
        return config.sec_user_agent(settings)
    except config.SettingMissing as exc:
        fail(str(exc))


def write_results(script: str, data: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(exist_ok=True)
    path = RESULTS_DIR / f"{script}-{stamp()}.json"
    path.write_text(json.dumps(data, indent=2, default=str))
    return path


def table(headers: list[str], rows: list[list[Any]]) -> str:
    """A Markdown table, ready to paste into docs/phase0-results.md."""
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(":--" for _ in headers) + " |"]
    lines += ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]
    return "\n".join(lines)


def ask_number(question: str) -> float | None:
    """Ask Liam for a reading such as a usage percentage. Enter skips it."""
    while True:
        answer = input(f"{question} (press Enter to skip): ").strip().rstrip("%")
        if not answer:
            return None
        try:
            return float(answer)
        except ValueError:
            print("Type just the number, such as 12 or 12.5.")
