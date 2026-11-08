"""Look 2 ("Modern research", Liam's pick on 8 Nov 2026): the colours and words every download
shares, so the PDF, the deck and the workbook read as one house style."""

from __future__ import annotations

from importlib.resources import files

NAVY = "#0B2D5B"  # headings, rules, table headers, the base case
INK = "#1A1A1A"  # body text and numbers
GREY = "#595959"  # labels, source lines
RULE = "#BFBFBF"  # table hairlines
GRID = "#D9D9D9"  # chart gridlines
TINT = "#DCE6F2"  # table header fill
FILL = "#F2F2F2"  # sidebar and units rows
BEAR = "#D55E00"
BASE = NAVY
BULL = "#0072B2"
# The Tearsheet signature: the "price line" rule runs from deep teal to the app's cyan.
SIGNATURE_FROM = "#0E7490"
SIGNATURE_TO = "#7FE3F7"

BRAND = "TEARSHEET RESEARCH"
DISCLAIMER = (
    "Research data, not investment advice. Tearsheet makes this report with software from public "
    "filings, prices and news. It is not an offer or a recommendation to buy or sell any security, "
    "and it may contain errors: check the sources before relying on anything in it. The rating "
    "compares the company with its peer group over the next 12 months; it is not a price target."
)


def mark_png() -> bytes:
    """The Tearsheet glass logo, 256 px, transparent corners."""
    return files("tearsheet.export").joinpath("assets/mark.png").read_bytes()
