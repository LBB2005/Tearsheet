"""The fixed lines every report, download and log carries, in one place so they read the same
everywhere (docs/launch/launch-readiness.md, S1 and S6). The app keeps its own copy of the same
words in app/src/shared/wording.ts; a test on each side checks they match."""

from __future__ import annotations

# The one "not advice" wording (S6). The short form sits under the rating and in every download's
# footer; the long form opens a report file and closes the report in the app.
ADVICE_SHORT = "General research, not personalised investment advice."
ADVICE_LINE = ADVICE_SHORT + " Check the sources and make your own decisions."

# Massive's terms forbid passing its data on (S1), and the PDF, deck and workbook hold prices.
PRICES_LINE = "Prices from Massive, for your own use."
