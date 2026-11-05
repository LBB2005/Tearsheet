"""Year-over-year change in a filing section (design item 23).

Both years' paragraphs are lowercased and split into words. Each paragraph this year is
matched to the most similar unmatched paragraph in last year's same section, by the
difflib.SequenceMatcher ratio on the word lists, with its quick ratios as a first filter. A pair
matches at the cut-off or above. The change score is the words in unmatched paragraphs in both
years ÷ all the words in both years' section.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Change:
    score: float
    changed: list[str] = field(default_factory=list)  # this year's unmatched paragraphs


def _words(text: str) -> list[str]:
    return text.lower().split()


def change_score(this_year: list[str], last_year: list[str], *, cutoff: float) -> Change:
    this_words = [_words(p) for p in this_year]
    last_words = [_words(p) for p in last_year]
    total = sum(map(len, this_words)) + sum(map(len, last_words))
    if total == 0:
        return Change(0.0)
    unmatched_last = set(range(len(last_words)))
    unmatched_words, changed = 0, []
    for i, words in enumerate(this_words):
        best, best_j = 0.0, None
        for j in unmatched_last:
            matcher = difflib.SequenceMatcher(None, words, last_words[j], autojunk=False)
            if matcher.real_quick_ratio() < cutoff or matcher.quick_ratio() < cutoff:
                continue
            ratio = matcher.ratio()
            if ratio > best:
                best, best_j = ratio, j
        if best_j is not None and best >= cutoff:
            unmatched_last.discard(best_j)
        else:
            unmatched_words += len(words)
            changed.append(this_year[i])
    unmatched_words += sum(len(last_words[j]) for j in unmatched_last)
    return Change(unmatched_words / total, changed)
