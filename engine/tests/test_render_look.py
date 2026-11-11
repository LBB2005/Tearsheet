"""The report page's look goes through named colours (CSS custom properties) declared once at the
top of its style block, so the app can lay the look picked on Settings -> Appearance over them
(app/src/renderer/appearance/report.ts). A report file keeps the defaults: Tearsheet's dark look
at full glow, exactly as before the names came in."""

import re
from pathlib import Path

from tearsheet import render

TEMPLATE = (Path(render.__file__).parent / "templates" / "report.html.j2").read_text()
STYLE = TEMPLATE[TEMPLATE.index("<style>") : TEMPLATE.index("</style>")]
ROOT_START = STYLE.index(":root {")
ROOT = STYLE[ROOT_START : STYLE.index("}", ROOT_START)]
REST = STYLE[:ROOT_START] + STYLE[STYLE.index("}", ROOT_START) + 1 :]
LITERAL = re.compile(r"#[0-9A-Fa-f]{3,8}\b|rgba?\(\s*\d")


def declared() -> dict[str, str]:
    body = re.sub(r"/\*.*?\*/", "", ROOT, flags=re.S)
    return {m[1]: m[2].strip() for m in re.finditer(r"(--[\w-]+):\s*([^;]+);", body)}


def test_no_colour_is_typed_into_a_rule():
    assert LITERAL.findall(re.sub(r"/\*.*?\*/", "", REST, flags=re.S)) == []


def test_the_svg_gradients_use_the_names_too():
    defs = TEMPLATE[TEMPLATE.index("</style>") :]
    assert re.findall(r'stop-color="#', defs) == []
    assert "stop-color: var(--accent)" in defs


def test_every_name_used_is_declared():
    names = declared()
    local = set(re.findall(r'(?:^|[;{\s"])(--[\w-]+)\s*:', TEMPLATE))
    for used in set(re.findall(r"var\((--[\w-]+)", TEMPLATE)):
        assert used in names or used in local, used


def test_a_report_file_keeps_todays_look_at_full_glow():
    names = declared()
    assert names["--glow"] == "1"
    assert names["--base"] == "#070B14"
    assert names["--accent"] == "#7FE3F7"
    assert [names["--g1"], names["--g2"], names["--g3"]] == ["32 120 150", "70 60 170", "20 90 120"]
    assert names["--wt"] == "0" and names["--round"] == "1" and names["--frost"] == "1"
    assert "rgb(var(--g1) / calc(.20 * var(--glow)))" in STYLE
