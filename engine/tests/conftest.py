"""Shared test set-up. Every test is offline: real network connections, the real Keychain,
the real data folder and the real `claude` program are all out of reach."""

from __future__ import annotations

import socket
from datetime import UTC, datetime
from pathlib import Path

import keyring
import keyring.backend
import pytest

from tearsheet import config
from tearsheet.db import open_database
from tearsheet.rawstore import RawStore


class MemoryKeyring(keyring.backend.KeyringBackend):
    priority = 1  # type: ignore[assignment]

    def __init__(self) -> None:
        super().__init__()
        self.store: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, username: str) -> str | None:
        return self.store.get((service, username))

    def set_password(self, service: str, username: str, password: str) -> None:
        self.store[(service, username)] = password

    def delete_password(self, service: str, username: str) -> None:
        self.store.pop((service, username), None)


@pytest.fixture(autouse=True)
def offline(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    real_connect = socket.socket.connect

    def guarded_connect(sock: socket.socket, address: object) -> None:
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            raise OSError(f"tests are offline: blocked a connection to {address}")
        real_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    # No test may find or start the real AI programs.
    monkeypatch.delenv(config.CLAUDE_BIN_ENV, raising=False)
    monkeypatch.delenv(config.CODEX_BIN_ENV, raising=False)
    monkeypatch.setattr(config, "find_program", lambda tool: None)
    # Nor touch the real data folder or Keychain.
    monkeypatch.setattr(config, "DEFAULT_DATA_DIR", tmp_path / "default-data")
    monkeypatch.delenv(config.DATA_DIR_ENV, raising=False)
    keyring.set_keyring(MemoryKeyring())


@pytest.fixture
def database(tmp_path: Path):
    db = open_database(tmp_path / "data" / "tearsheet.sqlite")
    yield db
    db.close()


@pytest.fixture
def settings(database) -> config.Settings:
    return config.Settings(database.conn)


FIXED_NOW = datetime(2026, 11, 3, 15, 0, tzinfo=UTC)


@pytest.fixture
def rawstore(tmp_path: Path, database) -> RawStore:
    return RawStore(tmp_path / "data" / "raw", database.conn)


class FakeClock:
    """A clock and sleep pair: sleeping moves the clock forward and is recorded."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()
