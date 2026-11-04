"""A scripted AI connector for tests (design item 13). Later tests use it too (item 39).

Each scripted item is a RawAnswer to return, an exception to raise, or a function of the
request that returns either. When the script runs out, `default` is used.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable, Iterable
from typing import Any

from pydantic import BaseModel

from tearsheet.ai.client import CallRequest, RawAnswer

Scripted = RawAnswer | BaseException | Callable[[CallRequest], "RawAnswer | BaseException"]


def answer(
    content: BaseModel | dict[str, Any] | str,
    *,
    model_id: str | None = "fake-small",
    auth_source: str | None = "none",
    tool_events: Iterable[str] = (),
    tokens: dict[str, int] | None = None,
    **extra: Any,
) -> RawAnswer:
    """A RawAnswer whose text is `content` as JSON (or the string as given)."""
    if isinstance(content, BaseModel):
        text = content.model_dump_json()
    elif isinstance(content, dict):
        text = json.dumps(content)
    else:
        text = content
    extra.setdefault("tools_offered", [])
    extra.setdefault("tool_servers", [])
    return RawAnswer(
        text=text,
        model_id=model_id,
        auth_source=auth_source,
        tool_events=list(tool_events),
        tokens=tokens or {"input_tokens": 100, "output_tokens": 20},
        **extra,
    )


class FakeConnector:
    tool = "claude"
    display_name = "Fake tool"
    sign_in_fix = "fake login"
    web_search_tools = frozenset({"WebSearch", "web_search"})
    subscription_auth_sources = frozenset({"none"})

    def __init__(
        self,
        script: Iterable[Scripted] = (),
        *,
        default: Scripted | None = None,
        program_version: str = "1.0",
        delay_s: float = 0.0,
    ):
        self.script = list(script)
        self.default = default
        self.program_version = program_version
        self.delay_s = delay_s
        self.models = {
            "extract": "fake-small",
            "narrate": "fake-large",
            "link_search": "fake-large",
        }
        self.requests: list[CallRequest] = []
        self.version_calls = 0
        self.active = 0
        self.max_active = 0

    async def version(self) -> str:
        self.version_calls += 1
        return self.program_version

    async def call(self, request: CallRequest) -> RawAnswer:
        self.requests.append(request)
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            if self.delay_s:
                await asyncio.sleep(self.delay_s)
            item = self.script.pop(0) if self.script else self.default
            if item is None:
                raise AssertionError("the fake connector's script ran out")
            if callable(item) and not isinstance(item, BaseException):
                item = item(request)
            if isinstance(item, BaseException):
                raise item
            return item
        finally:
            self.active -= 1
