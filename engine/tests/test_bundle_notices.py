"""The built app's licence pieces (THIRD-PARTY-NOTICES.md; launch-readiness M6): the MIT stand-in
that replaces GPL Unidecode in the bundle, and the package list scripts/build-engine.sh writes."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def stand_in():
    return load("unidecode_stand_in", ROOT / "scripts" / "bundle" / "unidecode" / "__init__.py")


def test_the_stand_in_keeps_unidecodes_call_for_company_names(stand_in):
    assert stand_in.TEARSHEET_STAND_IN
    # edgartools lower-cases a company name, then folds it to ASCII for its search.
    assert stand_in.unidecode("société générale") == "societe generale"
    assert stand_in.unidecode("Nestlé S.A.") == "Nestle S.A."
    assert stand_in.unidecode("AT&T Inc.") == "AT&T Inc."
    assert stand_in.unidecode("Ελλάδα") == ""  # no ASCII form: dropped
    assert stand_in.unidecode("Ω", errors="replace") == "?"
    with pytest.raises(UnicodeEncodeError):
        stand_in.unidecode("Ω", errors="strict")


def test_the_stand_in_answers_every_name_edgartools_imports(stand_in):
    site = Path(importlib.util.find_spec("edgar").origin).parent
    used = {
        line.split("import", 1)[1].strip()
        for f in site.rglob("*.py")
        for line in f.read_text(errors="ignore").splitlines()
        if line.strip().startswith("from unidecode import")
    }
    assert used and all(hasattr(stand_in, n.strip()) for u in used for n in u.split(","))


def test_the_package_list_has_a_row_per_package_with_its_licence():
    notices = load("python_notices", ROOT / "scripts" / "python_notices.py")
    text = notices.markdown()
    rows = [r for r in text.splitlines() if r.startswith("| ") and not r.startswith("| Package")]
    names = {r.split("|")[1].strip().lower() for r in rows}
    assert {"edgartools", "httpx", "jinja2"} <= names
    assert all(r.count("|") == 4 for r in rows)  # no licence text broke a row
    licences = {r.split("|")[1].strip().lower(): r.split("|")[3].strip() for r in rows}
    assert licences["edgartools"] == "MIT"
