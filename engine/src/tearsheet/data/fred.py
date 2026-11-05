"""FRED series (design item 20): the 10-year yield for valuation, and the macro series for
section 8. A run uses the latest value on or before the run date."""

from __future__ import annotations

from bisect import bisect_right
from datetime import date

from tearsheet.http import HttpClient, fred_value

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"

Series = list[tuple[date, float]]


async def fetch_series(
    http: HttpClient, series_id: str, *, api_key: str, start: date | None = None
) -> Series:
    params = {"series_id": series_id, "api_key": api_key, "file_type": "json"}
    if start is not None:
        params["observation_start"] = start.isoformat()
    fetched = await http.fetch("fred", FRED_URL, kind=f"fred_{series_id}", params=params)
    return parse_observations(fetched.json())


def parse_observations(data: dict) -> Series:
    out: Series = []
    for row in data.get("observations") or []:
        value = fred_value(str(row.get("value", ".")))
        if value is not None:
            out.append((date.fromisoformat(row["date"]), value))
    return sorted(out)


def value_on(series: Series, day: date) -> tuple[date, float] | None:
    """The latest observation on or before `day`."""
    i = bisect_right([d for d, _ in series], day)
    return series[i - 1] if i else None
