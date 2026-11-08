#!/usr/bin/env bash
# Builds the engine the packaged app runs (design item 50): a standalone Python 3.12 with the
# engine and its locked dependencies installed into it, in app/engine-bundle/. electron-builder
# copies that folder into Tearsheet.app as Contents/Resources/engine (app/electron-builder.yml),
# and the main process starts it there when the app is packaged. `npm run package` runs this
# first; run it by hand only to look at the bundle.
#
# - Python is uv's own standalone CPython 3.12 (python-build-standalone), copied whole, so the
#   app needs no Python, uv or Homebrew on the Mac it runs on.
# - Its program is renamed "Tearsheet Engine", so Activity Monitor names the engine too.
# - The dependencies are exactly the ones in engine/uv.lock, checked against their hashes.
# - Everything is compiled ahead of time (unchecked-hash .pyc files), so the engine starts
#   quickly and never writes inside the app.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/app/engine-bundle"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || { echo "build-engine: uv wasn't found (https://docs.astral.sh/uv/)." >&2; exit 1; }

# 1. A clean copy of the standalone Python (installed by uv if this Mac doesn't have it yet).
uv python install --quiet 3.12
source_python="$(uv python find --managed-python --no-project 3.12)"
prefix="$("$source_python" -c 'import sys; print(sys.base_prefix)')"
rm -rf "$out"
mkdir -p "$out"
cp -R "$prefix/" "$out/"

# Only the interpreter is kept from bin/. The rest are helper scripts (pip, idle, pydoc...) and
# links, some with this Mac's paths in them. The headers, man pages and uv's "don't install here"
# marker go too: this copy is the app's own.
engine="$out/bin/Tearsheet Engine"
mv "$out/bin/python3.12" "$out/engine.tmp"
rm -rf "$out/bin" "$out/include" "$out/share" "$out/lib/pkgconfig"
mkdir "$out/bin"
mv "$out/engine.tmp" "$engine"
site="$out/lib/python3.12/site-packages"
rm -f "$out/lib/python3.12/EXTERNALLY-MANAGED"
rm -rf "$site"/pip "$site"/pip-*.dist-info

# 2. The engine's dependencies, exactly as locked, then the engine itself.
uv export --project "$root/engine" --frozen --no-dev --no-emit-project --quiet \
  --format requirements.txt --output-file "$work/requirements.txt"
uv pip install --python "$engine" --no-deps --require-hashes --quiet -r "$work/requirements.txt"
uv build "$root/engine" --wheel --out-dir "$work/wheel" --quiet
uv pip install --python "$engine" --no-deps --quiet "$work"/wheel/*.whl
# The packages' command-line scripts point at this build folder; the app runs none of them.
find "$out/bin" -mindepth 1 ! -name "Tearsheet Engine" -exec rm -rf {} +

# The Claude Agent SDK carries its own copy of Claude Code (about 300 MB). The engine never uses
# it: it always runs the user's own `claude`, passed to the SDK as cli_path
# (engine/src/tearsheet/ai/claude_code.py).
rm -rf "$site/claude_agent_sdk/_bundled"

# 3. Compile everything ahead of time. A handful of files in some packages are never imported
# and don't compile; Python just reads those from source if they ever are, so that's not an error.
find "$out" -name __pycache__ -type d -prune -exec rm -rf {} +
"$engine" -I -m compileall -q -f -j 0 --invalidation-mode unchecked-hash "$out/lib/python3.12" >/dev/null 2>&1 || true

# 4. Check it: the engine starts on an empty data folder, with no Keychain access, and says hello.
TEARSHEET_DATA_DIR="$work/data" PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring \
  "$engine" -I -B -m tearsheet.cli serve </dev/null >"$work/stdout.log" 2>"$work/stderr.log" || true
hello="$(head -n 1 "$work/stdout.log")"
case "$hello" in
  *'"method":"hello"'*) ;;
  *) echo "build-engine: the bundled engine didn't say hello. Its output:" >&2; cat "$work/stderr.log" >&2; exit 1 ;;
esac
version="$("$engine" -I -B -m tearsheet.cli --version)"
echo "Built app/engine-bundle ($version, Python $("$engine" -I -c 'import platform; print(platform.python_version())'), $(du -sh "$out" | cut -f1))."
