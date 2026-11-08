"""When macOS won't hand a key over. Each Keychain read can put a question on screen ("Tearsheet
Engine wants to use your confidential information..."); if it is answered no, or the Keychain is
locked, the engine carries on without that key, asks no more this session, and says why."""

from __future__ import annotations

import keyring
import keyring.backend
import keyring.errors

from tearsheet import config
from tests.conftest import MemoryKeyring
from tests.test_protocol import Harness, run


class SaysNoKeyring(MemoryKeyring):
    """The Keychain as it answers when its question is denied: every read fails."""

    def __init__(self) -> None:
        super().__init__()
        self.reads: list[str] = []
        self.saying_no = True

    def get_password(self, service: str, username: str) -> str | None:
        self.reads.append(username)
        if self.saying_no:
            raise keyring.errors.KeyringLocked(
                "Can't get password from keychain: (-128, 'Keychain Access Denied')"
            )
        return super().get_password(service, username)


def _says_no() -> SaysNoKeyring:
    backend = SaysNoKeyring()
    keyring.set_keyring(backend)
    return backend


def test_a_key_the_keychain_wont_give_reads_as_no_key_and_is_asked_for_once():
    backend = _says_no()

    assert config.get_key("massive") is None
    assert config.get_key("massive") is None
    assert backend.reads == ["massive"]  # one question on screen, not one per read
    assert config.key_locked("massive")
    assert not config.key_locked("fred")


def test_saving_a_key_asks_the_keychain_again():
    backend = _says_no()
    assert config.get_key("massive") is None

    backend.saying_no = False
    config.set_key("massive", "new-key")

    assert not config.key_locked("massive")
    assert config.get_key("massive") == "new-key"


def test_the_engine_starts_when_the_keychain_says_no_and_settings_say_so(tmp_path):
    from tearsheet.protocol import SettingsResult

    backend = _says_no()
    h = Harness(tmp_path)
    h.server.backfill_enabled = True  # the app's engine reads the Massive key as it starts

    async def go():
        await h.server.start()
        return await h.call("get_settings", {})

    settings = run(go())
    assert h.messages[0]["method"] == "hello"
    assert h.server.backfill_job is None
    s = SettingsResult.model_validate(settings["result"])
    assert s.keys["massive"] == "locked"
    assert backend.reads.count("massive") == 1
    h.server.close()


def test_loading_the_price_history_says_how_to_let_the_key_through(tmp_path):
    from tests.test_server_lookups import FakeHttp, _history_harness

    http = FakeHttp()
    h = _history_harness(tmp_path, http, key=None)
    _says_no()

    reply = run(h.call("fetch_history", {"report_id": "rep-1"}))
    assert reply["error"]["message"] == (
        "macOS didn’t let Tearsheet open your Massive key. Quit Tearsheet, open it again, "
        "and click Always Allow when macOS asks."
    )
    assert http.calls == []
    h.server.close()
