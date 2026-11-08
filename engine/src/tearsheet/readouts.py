"""The plain-language readouts shown when a reader points at the report.

The wording is fixed here and filled only with stored numbers; no AI writes any of it. The report
template and the app's bigger views both use these functions, so a number reads the same in both.
Each function returns plain text with no markup, and the caller escapes it.
"""

import math
from typing import Literal

from tearsheet.render import format_value

_CASES = {
    "bull": ("Bull case", "top", 90),
    "base": ("Base case", "middle", 50),
    "bear": ("Bear case", "bottom", 10),
}


def _upper_first(text: str) -> str:
    return text[:1].upper() + text[1:]


def _lower_first(text: str) -> str:
    # Acronyms such as "EPS" keep their capitals; only an ordinary word is lowered.
    if text[:2].isupper() and len(text) >= 2:
        return text
    return text[:1].lower() + text[1:]


def _percent_move(value: float, today: float | None) -> int | None:
    """The whole-percent move from today's price, rounded half up, or None with no usable price."""
    if today is None or not today > 0:
        return None
    return math.floor((value / today - 1) * 100 + 0.5)


def _against_today(value: float, today: float | None) -> str:
    """The clause that compares a price with today's, starting with a comma, or empty."""
    move = _percent_move(value, today)
    if move is None:
        return ""
    now = format_value("price", today)
    if move == 0:
        return f", about the same as today’s {now}"
    way = "above" if move > 0 else "below"
    return f", {abs(move)}% {way} today’s {now}"


def ordinal(k: int) -> str:
    if k % 100 in (11, 12, 13):
        return f"{k}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(k % 10, "th")
    return f"{k}{suffix}"


def score(percentile: int) -> str:
    return (
        f"Score: {ordinal(percentile)} percentile. "
        f"Better than {percentile} of 100 peers on the weighted factors."
    )


def factor(name: str, percentile: int, weight: float) -> str:
    # Written as the template writes a weight, so 0.075 reads 7.5% and 0.2 reads 20%.
    shown = ("%.1f" % (weight * 100)).rstrip("0").rstrip(".")
    return (
        f"{_upper_first(name)}: {ordinal(percentile)} percentile. "
        f"Better than {percentile} of 100 peers. Counts for {shown}% of the score."
    )


def metric(
    label: str, text: str, median_text: str | None, percentile: int | None, ticker: str
) -> str:
    parts = [f"{label}: {text}."]
    if median_text is None and percentile is None:
        parts.append("No peer values are stored.")
    if median_text is not None:
        parts.append(f"The peer median is {median_text}.")
    if percentile is not None:
        parts.append(f"{percentile}% of peers are below {ticker}.")
    return " ".join(parts)


def peer_metric(peer: str, label: str, text: str, own_text: str, ticker: str) -> str:
    return f"{peer}: {_lower_first(label)} {text}, against {own_text} for {ticker}."


def week(day_iso: str, close: float, today: float | None) -> str:
    day = format_value("date", day_iso)
    return f"Close on {day}: {format_value('price', close)}{_against_today(close, today)}."


def target(case: Literal["bull", "base", "bear"], value: float, today: float | None) -> str:
    name, place, percentile = _CASES[case]
    return (
        f"{name}: {format_value('price', value)} in 12 months{_against_today(value, today)}. "
        f"The {place} of the range, its {ordinal(percentile)} percentile."
    )


def past_year(
    first: float | None, last: float | None, bear: float | None, bull: float | None
) -> str:
    parts = []
    if first is not None and last is not None:
        start, end = format_value("price", first), format_value("price", last)
        move = _percent_move(last, first)
        if move is None:
            parts.append(f"Past year: {start} to {end}.")
        elif move == 0:
            parts.append(f"Past year: {start} to {end}, about level.")
        else:
            way = "up" if move > 0 else "down"
            parts.append(f"Past year: {start} to {end}, {way} {abs(move)}%.")
    if bear is not None and bull is not None:
        low, high = format_value("price", bear), format_value("price", bull)
        parts.append(f"The 12-month range runs from {low} to {high}.")
    return " ".join(parts)


def total_return(name: str, pct: float | None, years: int, *, group: bool = False) -> str:
    span = "the past year" if years == 1 else f"the past {years} years"
    if pct is None:
        return f"{name}: not stored for {span}."
    shown = f"{abs(pct):.1f}"
    if shown == "0.0":
        move = "unchanged"
    else:
        move = f"{'up' if pct > 0 else 'down'} {shown}%"
    tail = ", each peer weighted the same" if group else ""
    return f"{name}: {move} over {span}, with dividends{tail}."


def method_label(code: str) -> str:
    known = {
        "DCF": "Discounted cash flow",
        "RESIDUAL_INCOME": "Residual income",
        "MULTIPLES": "Multiples",
    }
    return known.get(code) or code.replace("_", " ").capitalize()


def method(code: str, value: float, today: float | None) -> str:
    return (
        f"{method_label(code)}: {format_value('price', value)} a share"
        f"{_against_today(value, today)}."
    )


def price(value: float, day_text: str | None) -> str:
    on = f" on {day_text}" if day_text else ""
    return f"Price: {format_value('price', value)}{on}."


def estimate(value: float, today: float | None) -> str:
    return f"Estimated value: {format_value('price', value)} a share{_against_today(value, today)}."


def band(bear: float, bull: float) -> str:
    return (
        f"12-month range: {format_value('price', bear)} to {format_value('price', bull)}, "
        "from the bear case to the bull case."
    )


def trigger(value: float | None, text: str) -> str:
    if value is None:
        return f"Buy trigger: {text}."
    return (
        f"Buy trigger: {text}. The price at which the rating would turn Buy, "
        "with the score and the peer value gaps held fixed."
    )


def gap(percentile: int | None) -> str:
    if percentile is None:
        return "Value gap percentile: not available."
    return (
        f"Value gap percentile: {percentile}. The gap between estimated value and price "
        f"is at the {ordinal(percentile)} percentile of the valued peers."
    )


def rating(call: str, capped: bool, percentile: int | None) -> str:
    text = f"Rating: {call}"
    if capped:
        text += ", capped by a red flag"
    text += "."
    if percentile is not None:
        text += f" Score: {ordinal(percentile)} percentile of its peer group."
    return text


def red_flag(label: str, found: bool) -> str:
    if found:
        return f"{label}: found. It caps the rating at Hold."
    return f"{label}: clear. Any red flag found caps the rating at Hold."


def red_flags(found: int, total: int) -> str:
    if found == 0:
        return f"No red flags found in {total} checks."
    what = "a red flag" if found == 1 else "red flags"
    return f"{found} of {total} checks found {what}. Any one caps the rating at Hold."


def economy(label: str, value: str, day_text: str) -> str:
    return f"{label}: {value} on {day_text}, from FRED."


def peer_rating(call: str, count: int, total: int) -> str:
    # The total counts every rated member of the group, usually the company itself too.
    return f"{call}: {count} of {total} companies in the group, rated before red-flag caps."


def claims(kind: Literal["kept", "removed"], count: int, total: int) -> str:
    if kind == "kept":
        return f"Kept: {count} of {total} claims passed every check."
    return f"Removed: {count} of {total} claims failed a check and were taken out."


def kept_item(title: str, count: int) -> str:
    noun = "claim" if count == 1 else "claims"
    return f"{title}: {count} {noun} kept."


def removed_item(text: str, reasons: list[str]) -> str:
    if not reasons:
        return f"{text} Removed."
    # The checker's reasons often end with a full stop; the sentence supplies its own.
    trimmed = [reason.rstrip().rstrip(".") for reason in reasons]
    return f"{text} Removed: {'; '.join(trimmed)}."


def table_row(header: list[str], row: list[str]) -> str:
    if not row:
        return ""
    subject = _upper_first(row[0])
    parts = []
    for i, cell in enumerate(row[1:], start=1):
        if not cell:
            continue
        name = header[i] if i < len(header) else ""
        parts.append(f"{_lower_first(name)} {cell}" if name else cell)
    if not parts:
        return f"{subject}."
    return f"{subject}: {', '.join(parts)}."


# --- Analyst ratings, from analystdb (data/analystdb.py) -----------------------------------------
# The street's view, shown beside the report and never part of its rating, score or range.

_SIDE_WORDS = {"Buy": "Buy or Strong Buy", "Hold": "Hold", "Sell": "Sell or Strong Sell"}
_TARGET_WORDS = {"mean": "Average", "median": "Median", "high": "Highest", "low": "Lowest"}


def _firms(n: int) -> str:
    return f"{n} firm" if n == 1 else f"{n} firms"


def analyst_side(call: str, count: int, total: int, asof_text: str) -> str:
    return f"{call}: {count} of {_firms(total)} rate it {_SIDE_WORDS.get(call, call)}, as of {asof_text}."


def analyst_target(
    kind: Literal["mean", "median", "high", "low"], value: float | None, n: int
) -> str:
    word = _TARGET_WORDS[kind]
    if value is None:
        return f"{word} analyst target: not available."
    text = f"{word} analyst target {format_value('price', value)}"
    if kind in ("mean", "median"):
        text += f", from the {_firms(n)} with a target"
    return f"{text}."


def analyst_band(
    low: float,
    high: float,
    mean: float | None,
    median: float | None,
    base: float | None,
    price: float | None,
    price_day_text: str | None,
) -> str:
    text = f"Analyst targets run from {format_value('price', low)} to {format_value('price', high)}"
    middle = [
        f"{name} {format_value('price', v)}"
        for name, v in (("average", mean), ("median", median))
        if v is not None
    ]
    text += f" ({', '.join(middle)})." if middle else "."
    ours = []
    if base is not None:
        ours.append(f"Tearsheet’s base value is {format_value('price', base)}")
    if price is not None:
        when = f"on {price_day_text}" if price_day_text else "at the report"
        ours.append(f"the price {when} was {format_value('price', price)}")
    if ours:
        text += f" {_upper_first('; '.join(ours))}."
    return text


def analyst_firm(
    firm: str,
    label: str,
    target: float | None,
    day_text: str,
    rank: int | None,
    ranked_of: int | None,
    excess_text: str | None,
) -> str:
    """`ranked_of` None: the track records didn't load, so none is said. `excess_text` None:
    too few calls to judge."""
    with_target = f" with a {format_value('price', target)} target" if target is not None else ""
    head = f"{firm} rates it {label}{with_target} ({day_text})."
    if ranked_of is None:
        return head
    place = f"#{rank} of {ranked_of} ranked firms" if rank is not None else "not ranked"
    calls = (
        f"its rating calls averaged {excess_text} against the S&P 500"
        if excess_text is not None
        else "not enough data to judge its calls"
    )
    return f"{head} Track record: {place}; {calls}."


def analyst_change(
    firm: str,
    action: str,
    from_label: str | None,
    to_label: str | None,
    prior: float | None,
    current: float | None,
    day_text: str,
) -> str:
    rating = to_label or "its rating"
    if action in ("up", "down"):
        verb = "upgraded" if action == "up" else "downgraded"
        what = (
            f"{verb} it from {from_label} to {rating}" if from_label else f"{verb} it to {rating}"
        )
    elif action == "init":
        what = f"started coverage at {rating}"
    elif action == "reit":
        what = f"reiterated {rating}"
    elif action == "main":
        what = f"maintained {rating}"
    else:
        what = f"changed its view to {rating}"
    if current is None:
        target = ""
    elif prior is None:
        target = f" and set a {format_value('price', current)} target"
    elif current == prior:
        target = f" and kept its {format_value('price', current)} target"
    else:
        verb = "raised" if current > prior else "cut"
        target = f" and {verb} its target from {format_value('price', prior)} to {format_value('price', current)}"
    return f"{firm} {what}{target} on {day_text}."


def analyst_check(
    label: str,
    ours_text: str,
    theirs_text: str,
    gap_words: str | None,
    within: bool,
    tolerance_text: str,
) -> str:
    gap = f", {gap_words}" if gap_words else ""
    verdict = "within" if within else "outside"
    return (
        f"{label}: analystdb {ours_text}, S&P Global {theirs_text}{gap}; "
        f"{verdict} the {tolerance_text} tolerance."
    )
