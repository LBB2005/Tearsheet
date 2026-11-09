"""Tearsheet's stand-in for Unidecode in the built app (THIRD-PARTY-NOTICES.md).

Unidecode is under the GPL. edgartools imports it, but only for its company-name search, which
Tearsheet never calls, so `scripts/build-engine.sh` ships this instead. It keeps Unidecode's
`unidecode(text)` call: letters with accents lose them ("Société" -> "Societe"), and other
characters that have no plain ASCII form are dropped. Part of Tearsheet, under its MIT licence.
"""

from __future__ import annotations

import unicodedata

TEARSHEET_STAND_IN = True

__all__ = ["unidecode", "unidecode_expect_ascii", "unidecode_expect_nonascii"]


def unidecode(string: str, errors: str = "ignore", replace_str: str = "?") -> str:
    out = []
    for char in unicodedata.normalize("NFKD", string):
        if char.isascii():
            out.append(char)
        elif unicodedata.combining(char):
            continue  # the accent of the letter before it
        elif errors == "replace":
            out.append(replace_str)
        elif errors == "strict":
            raise UnicodeEncodeError("ascii", string, 0, len(string), "no ASCII form")
        elif errors == "preserve":
            out.append(char)
    return "".join(out)


unidecode_expect_ascii = unidecode
unidecode_expect_nonascii = unidecode
