#!/bin/bash
# The stand-in for Claude Code's installer (design: docs/designs/first-run/first-run-setup.md,
# Stage 1, item 25). scripts/try-new-user.sh copies it into the test folder, where a test copy of
# Tearsheet runs it instead of `curl -fsSL https://claude.ai/install.sh | bash`.
#
# It "installs" by copying <test folder>/standin to <test folder>/tools/claude, prints the real
# installer's success lines (install.sh and `claude install`, read 2026-11-08), and sets
# claude=signed_out in the state file. With install=fail in the state file it changes nothing,
# prints a download error and exits with code 22, as `curl -f` does when the download fails.
set -eu

# Only the system's own programs, whatever PATH the app was given.
export PATH=/usr/bin:/bin:/usr/sbin:/sbin

here="$(cd "$(dirname "$0")" && pwd)"
state="$here/state"

# The last install= line of the state file (default ok), without trailing spaces.
install=ok
if [ -f "$state" ]; then
  install="$(sed -n 's/^install=//p' "$state" | tail -n 1 | sed 's/[[:space:]]*$//')"
fi

# set_state KEY VALUE: changes that one line (or adds it), keeping every other line as it was.
set_state() {
  touch "$state"
  awk -v key="$1" -v value="$2" '
    index($0, key "=") == 1 { if (!done) print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$state" >"$state.$$"
  mv -f "$state.$$" "$state"
}

if [ "$install" = fail ]; then
  sleep 1
  echo 'curl: (22) The requested URL returned error: 503' >&2
  exit 22
fi

echo 'Setting up Claude Code...'
sleep 1
mkdir -p "$here/tools"
cp "$here/standin" "$here/tools/claude.$$"
chmod 755 "$here/tools/claude.$$"
mv -f "$here/tools/claude.$$" "$here/tools/claude"
set_state claude signed_out

echo
echo '✔ Claude Code successfully installed!'
echo
echo '  Version: 2.1.317'
echo
echo "  Location: $here/tools/claude"
echo
echo '  Next: Run claude --help to get started'
echo
echo '✅ Installation complete!'
echo
