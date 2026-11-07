"""Settings, paths and keys (design item 3).

Values marked "confirmed in Phase 0" are the believed values. Each has a row in
docs/phase0-results.md, and is changed here once the live test settles it.
"""

from __future__ import annotations

import os
import re
import shutil
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import keyring

from tearsheet import ENGINE_VERSION

# --- Paths -------------------------------------------------------------------

DEFAULT_DATA_DIR = Path.home() / "Library" / "Application Support" / "Tearsheet"
DEFAULT_BACKUP_DIR = Path.home() / "Tearsheet Backups"
DATA_DIR_ENV = "TEARSHEET_DATA_DIR"


@dataclass(frozen=True)
class Paths:
    """Where one data folder keeps its database, raw downloads and logs."""

    data_dir: Path

    @property
    def db(self) -> Path:
        return self.data_dir / "tearsheet.sqlite"

    @property
    def raw(self) -> Path:
        return self.data_dir / "raw"

    @property
    def logs(self) -> Path:
        return self.data_dir / "logs"

    def ensure(self) -> Paths:
        for folder in (self.data_dir, self.raw, self.logs):
            folder.mkdir(parents=True, exist_ok=True)
        return self


def resolve_data_dir(cli_value: str | os.PathLike[str] | None = None) -> Path:
    """`--data-dir`, then `TEARSHEET_DATA_DIR`, then the default folder."""
    chosen = cli_value or os.environ.get(DATA_DIR_ENV)
    return Path(chosen).expanduser() if chosen else DEFAULT_DATA_DIR


# --- Keys (macOS Keychain) ---------------------------------------------------

KEYCHAIN_SERVICE = "Tearsheet"
KEY_SERVICES = ("massive", "fred", "alphavantage")


def _check_key_service(service: str) -> None:
    if service not in KEY_SERVICES:
        raise ValueError(f"Unknown key '{service}'. Keys are: {', '.join(KEY_SERVICES)}.")


def get_key(service: str) -> str | None:
    """Read one data key from the Keychain. Keys are never logged or sent to the window."""
    _check_key_service(service)
    return keyring.get_password(KEYCHAIN_SERVICE, service)


def set_key(service: str, value: str) -> None:
    _check_key_service(service)
    keyring.set_password(KEYCHAIN_SERVICE, service, value)


# A stored key its service refused is remembered until a call with it works again or a new key
# is saved, so the app can say the key stopped working.
def _refused_setting(service: str) -> str:
    return f"key_refused_{service}"


def note_key_answers(settings: Settings, *, refused: set[str], worked: set[str]) -> None:
    for service in KEY_SERVICES:
        if service in refused:
            settings.set_internal(_refused_setting(service), "1")
        elif service in worked:
            forget_key_refusal(settings, service)


def forget_key_refusal(settings: Settings, service: str) -> None:
    if settings.get(_refused_setting(service)):
        settings.set_internal(_refused_setting(service), "")


def refused_keys(settings: Settings) -> list[str]:
    return [s for s in KEY_SERVICES if settings.get(_refused_setting(s))]


# --- Run limits (Technical Plan §3, item 8) ----------------------------------

CALL_BUDGET = 50
# 5 at a time (was 3): the same calls, finishing about a minute sooner per report (7 Nov 2026).
AI_CALLS_IN_PARALLEL = 5
AI_CALL_TIME_LIMIT_S = 300
AI_RETRY_WAIT_S = 30
TOOL_VERSION_TIME_LIMIT_S = 5

# The model for each step on Claude Code: the smaller model reads, the larger one writes.
# Confirmed in Phase 0 (believed: the program accepts these aliases).
CLAUDE_MODELS = {
    "extract": "haiku",
    "narrate": "sonnet",
    "skeptic": "sonnet",
    "link_search": "sonnet",
}
# The model for each step on Codex. Empty means Codex's own default model for the user's
# plan; the live lock-down check records which model that is (docs/phase0-results.md), and a
# smaller model for extraction can be named here once it is confirmed.
CODEX_MODELS: dict[str, str] = {}

# --- Raw-data folder (Technical Plan §6) -------------------------------------

RAW_CAP_BYTES = 5 * 1024**3
RAW_CAP_WARN_SHARE = 0.9

# --- Outside services (item 4) -----------------------------------------------

SEC_REQUESTS_PER_SECOND = 8
# Massive's free plan. Confirmed in Phase 0.
MASSIVE_CALLS_PER_MINUTE = 5
MASSIVE_HISTORY_YEARS = (
    2  # the plan page says 2 (2026-11-05); the API served 5, which is not promised
)
ALPHAVANTAGE_CALLS_PER_DAY = 25
# Seen in Phase 0 (2026-11-05): two calls in the same second got "1 request per second".
ALPHAVANTAGE_REQUESTS_PER_SECOND = 1

# Massive's address and endpoints, believed to be Polygon's paths. Confirmed in Phase 0;
# they move to data/prices.py in Phase 1.
MASSIVE_BASE_URL = "https://api.massive.com"
MASSIVE_DAILY_BARS = "/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}"
MASSIVE_DIVIDENDS = "/v3/reference/dividends"
MASSIVE_SPLITS = "/v3/reference/splits"
MASSIVE_DAILY_SUMMARY = "/v2/aggs/grouped/locale/us/market/stocks/{day}"
# Massive's largest page for dividends and splits.
MASSIVE_PAGE_LIMIT = 1000
# Whole-market dividends a session, for planning: on 7 Nov 2026 the free key returned 3 pages
# of 1,000 for 10-15 Aug 2026 with more to come (funds pay often), so about 500-600 a session.
MARKET_DIVIDENDS_PER_DAY = 600
# A whole-market summary smaller than this was asked for before Massive had built it (4-6 Nov
# 2026 had 12,561-12,593 rows): it is neither used nor reused.
MARKET_SUMMARY_MIN_ROWS = 5000


# --- Settings ----------------------------------------------------------------


class SettingMissing(Exception):
    """A setting the user must enter once is not set. The message says how to set it."""


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(value: str) -> str:
    if not _EMAIL.match(value):
        raise ValueError("That doesn't look like an email address.")
    return value


def _choice(*options: str) -> Callable[[str], str]:
    def check(value: str) -> str:
        if value not in options:
            raise ValueError(f"Choose one of: {', '.join(options)}.")
        return value

    return check


def _positive_number(value: str) -> str:
    try:
        number = float(value)
    except ValueError:
        raise ValueError("Enter a number.") from None
    if number <= 0:
        raise ValueError("Enter a number above zero.")
    return value


def _folder(value: str) -> str:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError("Give the backup folder as a full path, such as ~/Tearsheet Backups.")
    return str(path)


@dataclass(frozen=True)
class SettingSpec:
    description: str
    check: Callable[[str], str]


# The settings a user may change with `set-setting`. Internal values (such as the
# Alpha Vantage day count) share the settings table but are not listed here.
SETTINGS: dict[str, SettingSpec] = {
    "sec_contact_email": SettingSpec(
        "The contact email SEC sees on every request (SEC asks every program for one).", _email
    ),
    "primary_tool": SettingSpec(
        "The AI tool that runs reports: claude or codex.", _choice("claude", "codex")
    ),
    "claude_mode": SettingSpec(
        "How the engine runs Claude Code: sdk (the Agent SDK) or cli (the program directly).",
        _choice("sdk", "cli"),
    ),
    "claude_billing": SettingSpec(
        "subscription (the default) or api. Only api passes ANTHROPIC_API_KEY to Claude Code.",
        _choice("subscription", "api"),
    ),
    "raw_cap_gb": SettingSpec(
        "The raw-data folder's size cap, in GB (default 5).", _positive_number
    ),
    "massive_calls_per_minute": SettingSpec(
        "Massive's call limit per minute (default 5, the free plan).", _positive_number
    ),
    "backup_dir": SettingSpec(
        "The folder for database backups (default ~/Tearsheet Backups/, which iCloud doesn't sync).",
        _folder,
    ),
    "setup_done": SettingSpec(
        "1 once first-time setup is finished, otherwise 0.", _choice("0", "1")
    ),
    "fred_skipped": SettingSpec(
        "1 if the FRED key step was skipped during setup, otherwise 0.", _choice("0", "1")
    ),
    "prices_backfill": SettingSpec(
        "on (the default) or off: the app's one-time background download of 14 months of prices "
        "for every S&P 500 company, which pauses while a report or grading runs.",
        _choice("on", "off"),
    ),
    "goal1_round": SettingSpec(
        "The Goal 1 round new full reports count toward (default 1). Raise it to restart the test after a fix.",
        _positive_number,
    ),
}


class Settings:
    """Reads and writes the `settings` table. The engine is its only writer."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def get(self, key: str, default: str | None = None) -> str | None:
        row = self._conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row[0] if row else default

    def set(self, key: str, value: str) -> str:
        """Set a user setting after checking it. Returns the stored value."""
        spec = SETTINGS.get(key)
        if spec is None:
            raise ValueError(f"Unknown setting '{key}'. Settings are: {', '.join(SETTINGS)}.")
        stored = spec.check(value.strip())
        self.set_internal(key, stored)
        return stored

    def set_internal(self, key: str, value: str) -> None:
        with self._conn:
            self._conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def number(self, key: str, default: float) -> float:
        value = self.get(key)
        return float(value) if value is not None else default


def sec_user_agent(settings: Settings) -> str:
    """`Tearsheet/<version> <email>`. No email is built in."""
    email = settings.get("sec_contact_email")
    if not email:
        raise SettingMissing(
            "SEC asks every program for a contact email. Set yours once with: "
            "tearsheet-engine set-setting sec_contact_email you@example.com"
        )
    return f"Tearsheet/{ENGINE_VERSION} {email}"


# --- AI tools ------------------------------------------------------------------

CLAUDE_BIN_ENV = "TEARSHEET_CLAUDE_BIN"
CODEX_BIN_ENV = "TEARSHEET_CODEX_BIN"
PATH_ENV = "TEARSHEET_PATH"
_PROGRAM_ENV = {"claude": CLAUDE_BIN_ENV, "codex": CODEX_BIN_ENV}


def tool_search_path() -> str:
    """The PATH passed in by the app, or this process's PATH in terminal mode."""
    return os.environ.get(PATH_ENV) or os.environ.get("PATH", "")


def find_program(tool: str) -> Path | None:
    """The app passes each program's path; in terminal mode it is looked up on PATH."""
    passed = os.environ.get(_PROGRAM_ENV[tool])
    if passed:
        return Path(passed)
    found = shutil.which(tool, path=tool_search_path())
    return Path(found) if found else None
