"""Banks, insurers and REITs (design item 27, Technical Plan §8).

Classes come from SIC code lists in peers.yaml. Banks and insurers use residual income plus
the P/E value; DCF and EV/EBIT are "not meaningful," because debt is part of their operations.
REITs use residual income plus price ÷ FFO against the REITs in the peer group (at least 5).
FFO = net income + real-estate depreciation − gains on property sales, labelled an
approximation.
"""

from __future__ import annotations

from typing import Any

from tearsheet.valuation.common import MethodValue
from tearsheet.valuation.multiples import harmonic_trimmed

FFO_NOTE = "FFO is an approximation from XBRL tags (it is not a standard line)."


def methods_for(financial_class: str) -> tuple[str, ...]:
    if financial_class in ("bank", "insurer"):
        return ("residual_income", "pe")
    if financial_class == "reit":
        return ("residual_income", "price_to_ffo")
    return ("dcf", "residual_income", "multiples")


def ffo(net_income: float | None, depreciation: float | None, gains: float | None) -> float | None:
    if net_income is None or depreciation is None:
        return None
    return net_income + depreciation - (gains or 0.0)


def price_to_ffo(
    *, ffo_per_share: float | None, reit_peers: list[tuple[float, float]], settings: dict[str, Any]
) -> MethodValue:
    rules = settings["multiples"]
    ratios = [price / per_share for price, per_share in reit_peers if per_share and per_share > 0]
    mean, kept = harmonic_trimmed(ratios, trim_share=float(rules["trim_share"]))
    details = {"reit_peers": len(kept), "note": FFO_NOTE}
    if mean is None or len(kept) < int(rules["min_peers"]):
        return MethodValue(
            "price_to_ffo",
            None,
            f"fewer than {rules['min_peers']} REIT peers with positive FFO",
            details,
        )
    if not ffo_per_share or ffo_per_share <= 0:
        return MethodValue("price_to_ffo", None, "the company's FFO is zero or below", details)
    return MethodValue("price_to_ffo", mean * ffo_per_share, None, details)
