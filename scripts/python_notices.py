"""List the Python packages in an install, with each one's version and licence, as Markdown.

`scripts/build-engine.sh` runs it with the bundled engine's own Python and saves the list as
`PYTHON-PACKAGES.md` in the bundle (THIRD-PARTY-NOTICES.md). Standard library only.

    python3 scripts/python_notices.py [site-packages folder]
"""

from __future__ import annotations

import importlib.metadata as metadata
import sys


def licence(dist: metadata.Distribution) -> str:
    md = dist.metadata
    expression = md.get("License-Expression")
    if expression:
        return expression
    classifiers = [
        c.split("::")[-1].strip()
        for c in (md.get_all("Classifier") or [])
        if c.startswith("License ::")
    ]
    if classifiers:
        return " / ".join(classifiers)
    text = (md.get("License") or "").strip().splitlines()
    return text[0][:60] if text else "see its licence file"


def rows(path: list[str] | None = None) -> list[tuple[str, str, str]]:
    seen: dict[str, tuple[str, str, str]] = {}
    for dist in metadata.distributions(path=path) if path else metadata.distributions():
        name = dist.metadata["Name"]
        if name and name.lower() not in seen:
            seen[name.lower()] = (name, dist.version, licence(dist).replace("|", "/"))
    return sorted(seen.values(), key=lambda r: r[0].lower())


def markdown(path: list[str] | None = None) -> str:
    lines = [
        "# Python packages in Tearsheet's engine",
        "",
        "Each package's full licence text is in its `.dist-info` folder in `site-packages`.",
        "",
        "| Package | Version | Licence |",
        "| :-- | :-- | :-- |",
    ]
    lines += [f"| {n} | {v} | {lic} |" for n, v, lic in rows(path)]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.stdout.write(markdown(sys.argv[1:] or None))
