"""Combining the valid valuation methods (design item 27).

The estimated value is the median of the valid methods (the average of two; the one value
when only one is valid). The uncertainty triggers from valuation: the DCF terminal value is
more than 85% of the DCF firm value; the valid methods differ by more than 40% of their median;
only one method is valid.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tearsheet.valuation.common import MethodValue, median


@dataclass(frozen=True)
class Combined:
    value: float | None
    methods: list[MethodValue]
    spread: float | None
    triggers: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return self.value is not None


def combine(
    methods: list[MethodValue], settings: dict[str, Any], *, terminal_share: float | None
) -> Combined:
    valid = [m.value for m in methods if m.valid]
    if not valid:
        return Combined(None, methods, None, [])
    value = median(valid)
    spread = (max(valid) - min(valid)) / value if len(valid) > 1 and value else None
    triggers = []
    if terminal_share is not None and terminal_share > float(
        settings["triggers"]["terminal_share"]
    ):
        triggers.append("terminal_share")
    if spread is not None and spread > float(settings["triggers"]["method_spread"]):
        triggers.append("method_spread")
    if len(valid) == 1:
        triggers.append("one_method")
    return Combined(value, methods, spread, triggers)
