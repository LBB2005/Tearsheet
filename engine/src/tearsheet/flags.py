"""Red flags and the insider-buying note (design item 25, Technical Plan §7).

Red flags cap the rating at Hold. They come from code rules only. The patterns are constants
here, so a change raises METHOD_CODE_VERSION. Matching is case-insensitive, sentence by
sentence.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta

RESTATEMENT_ITEM = "4.02"
_SENTENCES = re.compile(r"(?<=[.!?])\s+")
_ICFR = re.compile(r"internal control over financial reporting", re.I)
_NOT_EFFECTIVE = re.compile(r"\b(was|were|is|are) not effective\b|\bineffective\b", re.I)
_NEGATIONS = [
    re.compile(r"\bno substantial doubt\b", re.I),
    re.compile(r"\bnot raise substantial doubt\b", re.I),
    re.compile(r"\bdo(es)? not (believe|conclude)[^.]*substantial doubt\b", re.I),
    re.compile(r"substantial doubt[^.]*\b(alleviated|no longer)\b", re.I),
]
INSIDER_RECENT_DAYS = 183
ROUTINE_YEARS = 3


@dataclass(frozen=True)
class RedFlag:
    key: str
    label: str
    evidence: str


def _sentences(text: str) -> list[str]:
    return [s for s in _SENTENCES.split(text or "") if s.strip()]


def restatement(eight_ks: Iterable[tuple[str, date, tuple[str, ...]]], run_date: date) -> bool:
    """An 8-K with Item 4.02 filed in the 12 months before the run."""
    since = run_date - timedelta(days=365)
    return any(
        form.startswith("8-K") and RESTATEMENT_ITEM in items and since <= filed <= run_date
        for form, filed, items in eight_ks
    )


def material_weakness(item_9a: str) -> bool:
    return any(_ICFR.search(s) and _NOT_EFFECTIVE.search(s) for s in _sentences(item_9a))


def going_concern(auditor_report: str) -> bool:
    for s in _sentences(auditor_report):
        lowered = s.lower()
        if (
            "substantial doubt" in lowered
            and "going concern" in lowered
            and not any(p.search(s) for p in _NEGATIONS)
        ):
            return True
    return False


def red_flags(
    *,
    eight_ks: Iterable[tuple[str, date, tuple[str, ...]]],
    item_9a: str,
    auditor: str,
    risk_change: float | None,
    threshold: float,
    run_date: date,
) -> list[RedFlag]:
    flags = []
    if restatement(eight_ks, run_date):
        flags.append(
            RedFlag(
                "restatement",
                "Restatement",
                "an 8-K with Item 4.02 (non-reliance on earlier financial statements) in the last 12 months",
            )
        )
    if material_weakness(item_9a):
        flags.append(
            RedFlag(
                "material_weakness",
                "Material weakness",
                "management concluded in Item 9A that internal control over financial reporting was not effective",
            )
        )
    if going_concern(auditor):
        flags.append(
            RedFlag(
                "going_concern",
                "Going concern",
                "the auditor's report states substantial doubt about the company continuing as a going concern",
            )
        )
    if risk_change is not None and risk_change > threshold:
        flags.append(
            RedFlag(
                "risk_factor_change",
                "Risk-factor change",
                f"Item 1A changed more than the {threshold:.0%} threshold from last year",
            )
        )
    return flags


@dataclass(frozen=True)
class InsiderNote:
    buyers: list[str]
    dates: list[date] = field(default_factory=list)


def insider_buying_note(
    trades: Iterable[tuple[str, date, str]], run_date: date
) -> InsiderNote | None:
    """Shown in section 5 when an insider bought on the open market (code P) in the last 6
    months and didn't buy in the same calendar month in each of the prior 3 years (the
    "routine" test from Cohen, Malloy & Pomorski)."""
    purchases = [(who, day) for who, day, code in trades if code == "P"]
    recent = [
        (who, day) for who, day in purchases if 0 <= (run_date - day).days <= INSIDER_RECENT_DAYS
    ]
    buyers, dates = [], []
    for who, day in recent:
        routine = all(
            any(w == who and d.month == day.month and d.year == day.year - k for w, d in purchases)
            for k in range(1, ROUTINE_YEARS + 1)
        )
        if not routine and who not in buyers:
            buyers.append(who)
            dates.append(day)
    return InsiderNote(buyers, dates) if buyers else None
