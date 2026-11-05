"""Versioned prompts (design item 30). Each file starts with a `version:` line, which is
logged with every call and is part of the evidence cache key."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from importlib import resources


@dataclass(frozen=True)
class Prompt:
    name: str
    version: str
    text: str


@cache
def load_prompt(name: str) -> Prompt:
    raw = (resources.files("tearsheet.ai") / "prompts" / f"{name}.md").read_text(encoding="utf-8")
    first, _, rest = raw.partition("\n")
    if not first.startswith("version:"):
        raise ValueError(f"prompts/{name}.md must start with a version line")
    return Prompt(name, first.removeprefix("version:").strip(), rest.strip())
