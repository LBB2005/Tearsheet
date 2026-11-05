"""The methodology bundle and its hashes (design items 14 and 15)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from tearsheet import methodology
from tearsheet.methodology import HASHED_FILES, REFERENCE_FILES, MethodologyError, load

SHIPPED = Path(methodology.__file__).parent


def copy_bundle(tmp_path: Path) -> Path:
    target = tmp_path / "methodology"
    shutil.copytree(SHIPPED, target, ignore=shutil.ignore_patterns("*.py", "__pycache__"))
    return target


def test_the_shipped_bundle_loads():
    m = load()
    assert set(m.weights["factors"]) == {
        "profitability",
        "momentum",
        "valuation",
        "capital_discipline",
        "balance_sheet",
        "earnings_quality",
    }
    assert sum(f["weight"] for f in m.weights["factors"].values()) == pytest.approx(1.0)
    assert m.rating_lines["min_valued_peers"] == 15
    assert m.valuation["dcf"]["terminal_growth_cap"] == 0.025
    assert m.peers["peer_cap"] == 40
    assert len(m.methodology_hash) == 64 and len(m.reference_version) == 64
    assert isinstance(m.grading_version, int)


def test_the_hash_ignores_comments_and_key_order(tmp_path):
    bundle = copy_bundle(tmp_path)
    before = load(bundle).methodology_hash
    path = bundle / "weights.yaml"
    text = path.read_text()
    path.write_text("# a new comment\n" + text + "\n# another one\n")
    assert load(bundle).methodology_hash == before

    peers = bundle / "peers.yaml"
    lines = peers.read_text().splitlines()
    top = [i for i, line in enumerate(lines) if line and not line.startswith((" ", "#"))]
    first, second = top[0], top[1]
    # Move the first top-level key to the end of the file.
    block = lines[first:second]
    peers.write_text("\n".join(lines[:first] + lines[second:] + block) + "\n")
    assert load(bundle).methodology_hash == before


def test_the_hash_changes_with_any_value(tmp_path):
    bundle = copy_bundle(tmp_path)
    before = load(bundle)
    path = bundle / "valuation.yaml"
    path.write_text(
        path.read_text().replace("terminal_growth_cap: 0.025", "terminal_growth_cap: 0.02")
    )
    after = load(bundle)
    assert after.methodology_hash != before.methodology_hash
    assert after.reference_version == before.reference_version


def test_the_local_allowlist_changes_the_reference_version_only(tmp_path):
    before = load()
    local = tmp_path / "allowlist.local.yaml"
    local.write_text("news_outlets:\n  - example-news.com\n")
    after = load(local_allowlist=local)
    assert after.reference_version != before.reference_version
    assert after.methodology_hash == before.methodology_hash
    assert "example-news.com" in after.allowlist_sites()
    assert "reuters.com" in after.allowlist_sites()


def test_weights_that_do_not_add_up_are_refused(tmp_path):
    bundle = copy_bundle(tmp_path)
    path = bundle / "weights.yaml"
    path.write_text(path.read_text().replace("weight: 0.30", "weight: 0.40"))
    with pytest.raises(MethodologyError, match="add up"):
        load(bundle)


def test_stored_copies_round_trip(rawstore):
    m = load()
    hashes = m.store_copies(rawstore, "run-1")
    assert set(hashes) == {"methodology", "reference"}
    again = methodology.from_stored(
        rawstore.get(hashes["methodology"]), rawstore.get(hashes["reference"])
    )
    assert again.methodology_hash == m.methodology_hash
    assert again.reference_version == m.reference_version
    assert again.valuation == m.valuation


def test_file_groups():
    assert HASHED_FILES == ("weights", "rating_lines", "valuation", "peers")
    assert set(REFERENCE_FILES) == {"aliases", "allowlist", "fred", "names", "instruction_phrases"}
