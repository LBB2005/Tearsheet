"""Dig deeper: today's picture of one stock beside its newest report (design spec
docs/superpowers/specs/2026-11-17-dig-deeper-design.md).

Each module builds one part of the page from saved data and, for the live parts, bytes fetched
through the usual HttpClient and RawStore, so a snapshot can be rebuilt (replay-dig). The
engine works out every number; nothing here changes a report, a score or a prediction.
"""

from __future__ import annotations

# Raised when a snapshot's numbers would change for the same inputs. Report numbers have their
# own METHOD_CODE_VERSION, which Dig deeper never touches.
DIG_CODE_VERSION = 1

# What each part of a snapshot can be: fresh; carried from an earlier snapshot because the
# refresh couldn't reach its source; not available (no key, or not on the plan); or failed with
# no earlier copy.
PART_STATES = ("ok", "stale", "off", "down")
