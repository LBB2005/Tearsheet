"""Peer groups (design item 24, Technical Plan §7).

A company's group is the 40 largest members of its GICS sector by index weight, not counting
the company. Each peer gets an equal weight. A peer left out of a run (missing or stale prices,
or no valid valuation) is not replaced by the next largest; the report lists it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tearsheet.data.membership import Holdings


@dataclass(frozen=True)
class PeerGroup:
    cik: int
    sector: str
    peers: list[int]  # largest index weight first
    trend_peers: list[int]  # the largest few, for the trends section
    left_out: dict[int, str] = field(default_factory=dict)

    @property
    def weight(self) -> float:
        return 1 / len(self.peers) if self.peers else 0.0

    @property
    def members(self) -> list[int]:
        """The company and its peers: the reference set for percentiles."""
        return [self.cik, *self.peers]

    def leave_out(self, cik: int, reason: str) -> PeerGroup:
        if cik not in self.peers:
            return self
        return PeerGroup(
            self.cik,
            self.sector,
            [p for p in self.peers if p != cik],
            [p for p in self.trend_peers if p != cik],
            {**self.left_out, cik: reason},
        )


def build_peer_group(holdings: Holdings, cik: int, *, cap: int, trend: int) -> PeerGroup:
    sector = holdings.company(cik).sector
    others = [c.cik for c in holdings.sector_members(sector) if c.cik != cik]
    peers = others[:cap]
    return PeerGroup(cik, sector, peers, peers[:trend])
