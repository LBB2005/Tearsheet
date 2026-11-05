"""Reader flags, spot-checks, per-report answers and the Goal 1 tally (design item 36).

Every review goes in one add-only table, `claim_reviews`:

| Origin        | Row                                                  | Labels                              |
| spot_check    | one per citation checked (claim ID, citation index)  | supported, not_supported, wrong     |
| reader_flag   | the flag, with Liam's note                           | open                                |
| reader_flag   | the resolution, pointing at the flag                 | confirmed_error, not_an_error       |
| report_answer | one per report, with no claim ID                     | yes, no                             |

Counted reports are full-method reports in the current Goal 1 round. Every citation is checked
in the first 3 counted reports; after that, 5 per report, picked at random with the report ID
as the seed. Liam confirms the two mappings below (confirmed errors, failed citations) before
the first counted report.
"""

from __future__ import annotations

import json
import random
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

LABELS = {
    "spot_check": {"supported", "not_supported", "wrong"},
    "reader_flag": {"open", "confirmed_error", "not_an_error"},
    "report_answer": {"yes", "no"},
}
FULL_CHECK_REPORTS = 3
LATER_CHECKS = 5
OUTSIDE_CHECKER_REPORTS = 10
# Goal 1's pass marks (drafter defaults, design Goals).
MIN_REPORTS, MIN_SECTORS, YES_SHARE = 10, 4, 0.75


def add_review(
    conn: sqlite3.Connection,
    *,
    report_id: str,
    origin: str,
    label: str,
    claim_id: str | None = None,
    citation_index: int | None = None,
    note: str | None = None,
    resolves: str | None = None,
) -> str:
    if label not in LABELS.get(origin, set()):
        raise ValueError(
            f"'{label}' is not a label for {origin}; use one of {sorted(LABELS.get(origin, []))}"
        )
    review_id = f"rev-{uuid.uuid4().hex[:12]}"
    with conn:
        conn.execute(
            "INSERT INTO claim_reviews (review_id, report_id, claim_id, citation_index, origin, label, note, resolves_review_id, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                review_id,
                report_id,
                claim_id,
                citation_index,
                origin,
                label,
                note,
                resolves,
                datetime.now(UTC).isoformat(),
            ),
        )
    return review_id


def counted_reports(conn: sqlite3.Connection, *, goal1_round: int) -> list[str]:
    rows = conn.execute(
        "SELECT r.report_id FROM reports r JOIN runs u ON u.run_id = r.run_id"
        " WHERE u.mode = 'full' AND r.goal1_round = ? ORDER BY r.created_at",
        (goal1_round,),
    ).fetchall()
    return [r[0] for r in rows]


def citations_to_check(
    conn: sqlite3.Connection, report_id: str, *, goal1_round: int
) -> list[tuple[str, int]]:
    """(claim ID, citation index) pairs for Liam to open, in report order."""
    every = []
    for claim_id, citations in conn.execute(
        "SELECT claim_id, citations_json FROM claims WHERE report_id = ? AND removed = 0 ORDER BY claim_id",
        (report_id,),
    ):
        every += [(claim_id, i) for i in range(len(json.loads(citations)))]
    counted = counted_reports(conn, goal1_round=goal1_round)
    if report_id in counted[:FULL_CHECK_REPORTS]:
        return every
    picked = random.Random(report_id).sample(every, min(LATER_CHECKS, len(every)))
    return sorted(picked)


@dataclass(frozen=True)
class Goal1Tally:
    reports: int
    companies: int
    sectors: int
    has_bank_or_reit: bool
    confirmed_errors: int
    failed_citations: int
    yes_share: float | None
    outside_checker_share: float | None

    @property
    def passed(self) -> bool:
        return (
            self.reports >= MIN_REPORTS
            and self.sectors >= MIN_SECTORS
            and self.has_bank_or_reit
            and self.confirmed_errors == 0
            and self.failed_citations == 0
            and self.yes_share is not None
            and self.yes_share >= YES_SHARE
        )


def tally(conn: sqlite3.Connection, *, goal1_round: int) -> Goal1Tally:
    counted = counted_reports(conn, goal1_round=goal1_round)
    if not counted:
        return Goal1Tally(0, 0, 0, False, 0, 0, None, None)
    marks = ",".join("?" for _ in counted)
    companies = conn.execute(
        f"SELECT DISTINCT c.cik, c.sector, c.financial_class FROM reports r JOIN runs u ON u.run_id = r.run_id"
        f" JOIN companies c ON c.cik = u.cik WHERE r.report_id IN ({marks})",
        counted,
    ).fetchall()
    reviews = conn.execute(
        f"SELECT * FROM claim_reviews WHERE report_id IN ({marks})", counted
    ).fetchall()
    confirmed = {
        r["claim_id"]
        for r in reviews
        if r["origin"] == "reader_flag" and r["label"] == "confirmed_error"
    }
    confirmed |= {
        r["claim_id"] for r in reviews if r["origin"] == "spot_check" and r["label"] == "wrong"
    }
    failed = sum(
        1 for r in reviews if r["origin"] == "spot_check" and r["label"] == "not_supported"
    )
    answers = [r["label"] for r in reviews if r["origin"] == "report_answer"]
    early = set(counted[:OUTSIDE_CHECKER_REPORTS])
    checked = [r for r in reviews if r["origin"] == "spot_check" and r["report_id"] in early]
    return Goal1Tally(
        reports=len(counted),
        companies=len({c[0] for c in companies}),
        sectors=len({c[1] for c in companies}),
        has_bank_or_reit=any(c[2] in ("bank", "reit") for c in companies),
        confirmed_errors=len(confirmed),
        failed_citations=failed,
        yes_share=answers.count("yes") / len(answers) if answers else None,
        outside_checker_share=(
            sum(1 for r in checked if r["label"] == "not_supported") / len(checked)
        )
        if checked
        else None,
    )
