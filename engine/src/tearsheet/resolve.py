"""Company lookup, share classes and ticker spellings (design item 21).

Lookup order: exact ticker, then alias, then a close match on the company name. Anything
outside the S&P 500 gets "not covered yet." The rated class is the share class with the
largest index weight; values, ranges and trigger prices are in that class's price.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from typing import Any, Protocol

NAME_MATCH_CUTOFF = 0.8
CANDIDATES = 3
# Share-class conversion ratios into the other class (BRK.A = 1,500 BRK.B).
CONVERSION_RATIOS = {"BRK.A": 1500.0}

_SUFFIXES = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|holdings?|group|"
    r"class [a-c]|the|n\.?v\.?|s\.?a\.?|& co)\b\.?",
    re.IGNORECASE,
)


class NotCovered(Exception):
    """Not an S&P 500 company, or nothing matched."""

    def __init__(self, message: str, candidates: list[str] | None = None):
        super().__init__(message)
        self.candidates = candidates or []


class HoldingsView(Protocol):
    def has(self, cik: int) -> bool: ...
    def tickers_of(self, cik: int) -> tuple[str, ...]: ...
    def name_of(self, cik: int) -> str: ...


def canonical_ticker(ticker: str) -> str:
    """The stored form, such as BRK.B."""
    return ticker.strip().upper().replace("-", ".").replace("/", ".")


def ticker_for(provider: str, ticker: str) -> str:
    """Each provider's spelling of a canonical ticker (confirmed in Phase 0)."""
    ticker = canonical_ticker(ticker)
    if provider in ("sec", "alphavantage"):
        return ticker.replace(".", "-")
    if provider == "ishares":
        return ticker.replace(".", "")
    if provider == "massive":
        return ticker
    raise ValueError(f"unknown provider: {provider}")


def sec_ticker_map(tickers_json: dict[str, Any]) -> dict[str, int]:
    """SEC's company_tickers.json as canonical ticker → CIK."""
    return {
        canonical_ticker(row["ticker"]): int(row["cik_str"])
        for row in tickers_json.values()
        if row.get("ticker")
    }


def _plain_name(name: str) -> str:
    return " ".join(_SUFFIXES.sub(" ", name.lower().replace(",", " ")).split())


@dataclass(frozen=True)
class Resolved:
    cik: int
    name: str
    share_classes: tuple[str, ...]
    rated_ticker: str
    matched_by: str

    def conversion_ratio(self, ticker: str) -> float:
        return CONVERSION_RATIOS.get(canonical_ticker(ticker), 1.0)


def _found(cik: int, holdings: HoldingsView, how: str) -> Resolved:
    classes = holdings.tickers_of(cik)
    return Resolved(cik, holdings.name_of(cik), classes, classes[0], how)


def resolve(
    query: str,
    sec_tickers: dict[str, int],
    holdings: HoldingsView,
    *,
    aliases: dict[str, int],
    member_ciks: list[int] | None = None,
) -> Resolved:
    text = query.strip()
    ticker = canonical_ticker(text)
    if ticker in sec_tickers:
        cik = sec_tickers[ticker]
        if not holdings.has(cik):
            raise NotCovered(f"{ticker} is not covered yet: Tearsheet covers S&P 500 companies.")
        return _found(cik, holdings, "ticker")

    alias = aliases.get(text.lower())
    if alias is not None and holdings.has(int(alias)):
        return _found(int(alias), holdings, "alias")

    ciks = member_ciks if member_ciks is not None else sorted(set(sec_tickers.values()))
    names = {cik: _plain_name(holdings.name_of(cik)) for cik in ciks if holdings.has(cik)}
    wanted = _plain_name(text)
    scored = sorted(
        ((difflib.SequenceMatcher(None, wanted, name).ratio(), cik) for cik, name in names.items()),
        reverse=True,
    )
    good = [(score, cik) for score, cik in scored if score >= NAME_MATCH_CUTOFF]
    if len(good) == 1 or (good and good[0][0] - good[1][0] > 0.05):
        return _found(good[0][1], holdings, "name")
    if good:
        raise NotCovered(
            f"More than one company matches {text!r}.",
            [holdings.name_of(cik) for _, cik in good[:CANDIDATES]],
        )
    raise NotCovered(f"No S&P 500 company matches {text!r}.")
