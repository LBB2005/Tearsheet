"""The methodology bundle and its versions (design items 14 and 15).

Four files can change a prediction's numbers; they are hashed together into the
methodology hash. Five more are reference files (aliases, the news allowlist, the FRED list,
the numeric guard's lists and the instruction phrases); they share the reference version.
Both hashes are taken over the parsed contents as canonical JSON, so comments and key
order don't change them. Grading rules carry their own version number.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

HERE = Path(__file__).parent
HASHED_FILES = ("weights", "rating_lines", "valuation", "peers")
REFERENCE_FILES = ("aliases", "allowlist", "fred", "names", "instruction_phrases")
LOCAL_ALLOWLIST = "allowlist.local.yaml"


class MethodologyError(ValueError):
    pass


def canonical(data: Any) -> bytes:
    """Sorted keys and no spaces, so the same contents always give the same bytes."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _hash(data: Any) -> str:
    return hashlib.sha256(canonical(data)).hexdigest()


def _read(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text()) or {}
    except FileNotFoundError as exc:
        raise MethodologyError(f"missing methodology file: {path}") from exc
    except yaml.YAMLError as exc:
        raise MethodologyError(f"{path.name} isn't valid YAML: {exc}") from exc


def _layer_allowlist(shipped: dict[str, list[str]], local: dict[str, Any]) -> dict[str, list[str]]:
    """Liam's local file adds sites to a group; `remove:` takes sites away from every group."""
    merged = {group: list(sites or []) for group, sites in shipped.items()}
    removed = {str(s).lower() for s in (local.get("remove") or [])}
    for group, sites in local.items():
        if group == "remove":
            continue
        merged.setdefault(group, [])
        merged[group] += [s for s in (sites or []) if s not in merged[group]]
    return {g: [s for s in sites if s.lower() not in removed] for g, sites in merged.items()}


def _validate(files: dict[str, Any]) -> None:
    factors = files["weights"].get("factors") or {}
    total = sum(float(f.get("weight", 0)) for f in factors.values())
    if abs(total - 1.0) > 1e-9:
        raise MethodologyError(f"weights.yaml: the factor weights add up to {total:g}, not 1")
    for name, factor in factors.items():
        if not factor.get("metrics"):
            raise MethodologyError(f"weights.yaml: factor {name} has no metrics")
    levels = files["rating_lines"].get("uncertainty_levels") or []
    lines = files["rating_lines"].get("percentile_lines") or {}
    if set(levels) != set(lines):
        raise MethodologyError(
            "rating_lines.yaml: every uncertainty level needs Buy and Sell lines"
        )
    for level, line in lines.items():
        if not 0 <= line["sell"] < line["buy"] <= 100:
            raise MethodologyError(f"rating_lines.yaml: {level} needs 0 ≤ sell < buy ≤ 100")
    if not files["valuation"].get("cost_of_equity"):
        raise MethodologyError("valuation.yaml: the cost-of-equity table is missing")
    if int(files["peers"].get("peer_cap", 0)) <= 0:
        raise MethodologyError("peers.yaml: peer_cap must be a positive number")


@dataclass(frozen=True)
class Methodology:
    weights: dict[str, Any]
    rating_lines: dict[str, Any]
    valuation: dict[str, Any]
    peers: dict[str, Any]
    aliases: dict[str, Any]
    allowlist: dict[str, list[str]]
    fred: dict[str, Any]
    names: dict[str, Any]
    instruction_phrases: dict[str, Any]
    grading: dict[str, Any] = field(default_factory=dict)

    def hashed_contents(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in HASHED_FILES}

    def reference_contents(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in REFERENCE_FILES}

    @property
    def methodology_hash(self) -> str:
        return _hash(self.hashed_contents())

    @property
    def reference_version(self) -> str:
        return _hash(self.reference_contents())

    @property
    def grading_version(self) -> int:
        return int(self.grading.get("version", 0))

    def allowlist_sites(self) -> list[str]:
        seen: list[str] = []
        for sites in self.allowlist.values():
            seen += [s for s in sites if s not in seen]
        return seen

    def store_copies(self, rawstore, run_id: str) -> dict[str, str]:
        """Save both sets in the raw store under their hashes, so replay can load them."""
        out = {}
        for kind, contents, version in (
            ("methodology", self.hashed_contents(), self.methodology_hash),
            ("reference", self.reference_contents(), self.reference_version),
        ):
            out[kind] = rawstore.put(
                canonical(contents),
                f"tearsheet:{kind}/{version}",
                "tearsheet",
                "application/json",
                run_id,
            )
        return out


def load(directory: Path | None = None, *, local_allowlist: Path | None = None) -> Methodology:
    directory = directory or HERE
    files = {name: _read(directory / f"{name}.yaml") for name in (*HASHED_FILES, *REFERENCE_FILES)}
    _validate(files)
    allowlist = {g: list(s or []) for g, s in files["allowlist"].items()}
    if local_allowlist is not None and local_allowlist.exists():
        allowlist = _layer_allowlist(allowlist, _read(local_allowlist))
    files["allowlist"] = allowlist
    grading_path = directory / "grading.yaml"
    grading = _read(grading_path) if grading_path.exists() else {}
    return Methodology(**files, grading=grading)


def from_stored(methodology_json: bytes, reference_json: bytes) -> Methodology:
    """The bundle a past run used, from its stored copies (for replay, item 38)."""
    hashed, reference = json.loads(methodology_json), json.loads(reference_json)
    return Methodology(**hashed, **reference)
