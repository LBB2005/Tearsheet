#!/usr/bin/env bash
# Tries Tearsheet as a brand-new person would, on the owner's own Mac, without touching his real
# Claude Code, Codex, keys or app (design: docs/designs/first-run/first-run-setup.md, CUJ 7, §6
# and Stage 1, item 27).
#
# - It makes a fresh test folder: the stand-in and its two installers (scripts/test-tools/), a
#   state file, the stand-in tools under tools/, and an empty data folder.
# - It records the real tools: `loggedIn` and `orgId` from `claude auth status --json` (never the
#   email), the `codex login status` message, and each tool's path and version. They are kept
#   only in <test folder>/real/, which is removed when the script ends.
# - It starts a test copy of the bundle `npm run package` builds (app/dist/mac-arm64/Tearsheet.app,
#   never the /Applications copy) with the test switches, and stops it if its setup log doesn't
#   show the test rules on within 20 seconds.
# - When the copy quits, it reads the real tools again and prints "unchanged", or which values
#   changed (never the values themselves).
#
# Run scripts/try-new-user.sh --help for the options.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
bundle="$root/app/dist/mac-arm64/Tearsheet.app"
tools_src="$root/scripts/test-tools"
claude_minimum=2.1.317 # the first Claude Code whose status command never signs anyone out

usage() {
  cat <<'EOF'
Usage: scripts/try-new-user.sh [--state KEY=VALUE ...] [--switch-off] [--switch-url URL]
                               [--hidden] [--dry-run]

  --state KEY=VALUE ...  The test's starting state. Any of:
                           claude=missing|signed_out|signed_in|api_key|too_old  (default missing)
                           codex=missing|signed_out|signed_in|api_key           (default missing)
                           login=normal|hang      a sign-in that hangs until it is stopped
                           install=ok|fail        a stand-in install that fails its download
                           check=pass|fail|unfinished   how the canned safety check ends
                         "missing" leaves that tool out. While the test runs, the state can be
                         changed by editing one line of <test folder>/state.
  --switch-off           Saves "off" as the online off switch, so the copy opens with the
                         Install button off.
  --switch-url URL       Where the copy reads the online off switch (TEARSHEET_SWITCH_URL).
  --hidden               For automated runs: the copy never shows a window or takes focus.
  --dry-run              Sets up the test folder and records the real tools, prints the command
                         that would start the copy, and compares the real tools again, without
                         starting anything.

Example: scripts/try-new-user.sh --state claude=signed_out codex=missing check=fail
EOF
}

die() {
  echo "try-new-user: $*" >&2
  exit 2
}

claude_state=missing
codex_state=missing
login=normal
install=ok
check=pass
switch_off=0
switch_url=''
hidden=0
dry_run=0

set_kv() {
  local key="${1%%=*}" value="${1#*=}"
  case "$key" in
    claude)
      case "$value" in
        missing | signed_out | signed_in | api_key | too_old) claude_state="$value" ;;
        *) die "claude=$value: use missing, signed_out, signed_in, api_key or too_old." ;;
      esac
      ;;
    codex)
      case "$value" in
        missing | signed_out | signed_in | api_key) codex_state="$value" ;;
        *) die "codex=$value: use missing, signed_out, signed_in or api_key." ;;
      esac
      ;;
    login)
      case "$value" in
        normal | hang) login="$value" ;;
        *) die "login=$value: use normal or hang." ;;
      esac
      ;;
    install)
      case "$value" in
        ok | fail) install="$value" ;;
        *) die "install=$value: use ok or fail." ;;
      esac
      ;;
    check)
      case "$value" in
        pass | fail | unfinished) check="$value" ;;
        *) die "check=$value: use pass, fail or unfinished." ;;
      esac
      ;;
    *) die "--state: $key isn't a key the test knows (claude, codex, login, install or check)." ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --state)
      shift
      [ $# -gt 0 ] && [[ "$1" == *=* && "$1" != -* ]] || die "--state needs at least one KEY=VALUE."
      while [ $# -gt 0 ] && [[ "$1" == *=* && "$1" != -* ]]; do
        set_kv "$1"
        shift
      done
      continue
      ;;
    --state=*) set_kv "${1#--state=}" ;;
    --switch-off) switch_off=1 ;;
    --switch-url)
      shift
      [ $# -gt 0 ] && [ -n "$1" ] || die "--switch-url needs a URL."
      switch_url="$1"
      ;;
    --switch-url=*)
      switch_url="${1#--switch-url=}"
      [ -n "$switch_url" ] || die "--switch-url needs a URL."
      ;;
    --hidden) hidden=1 ;;
    --dry-run) dry_run=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "$1 isn't an option. See --help." ;;
  esac
  shift
done

if [ "$dry_run" = 0 ] && [ ! -x "$bundle/Contents/MacOS/Tearsheet" ]; then
  die "there's no test bundle at app/dist/mac-arm64/Tearsheet.app. Build it first: cd app && npm run package"
fi

# 1. A fresh test folder (TEARSHEET_TEST_TOOLS).
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/tearsheet-new-user.XXXXXX")"
test_dir="$(cd "$test_dir" && pwd -P)"
real="$test_dir/real"
trap 'rm -rf "$real"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$test_dir/tools" "$test_dir/data"
for file in standin install-claude.sh install-codex.sh; do
  cp "$tools_src/$file" "$test_dir/$file"
  chmod 755 "$test_dir/$file"
done
{
  if [ "$claude_state" != missing ]; then echo "claude=$claude_state"; fi
  if [ "$codex_state" != missing ]; then echo "codex=$codex_state"; fi
  echo "login=$login"
  echo "install=$install"
  echo "check=$check"
} >"$test_dir/state"
for tool in claude codex; do
  if [ "$tool" = claude ]; then tool_state="$claude_state"; else tool_state="$codex_state"; fi
  if [ "$tool_state" != missing ]; then
    cp "$test_dir/standin" "$test_dir/tools/$tool"
    chmod 755 "$test_dir/tools/$tool"
  fi
done
if [ "$switch_off" = 1 ]; then
  printf '{"value": "off", "date": "%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$test_dir/data/install-switch.json"
fi

# 2. The real tools, recorded before and after. Only the values compared below are kept, in
#    <test folder>/real/; the status output itself (with the email) stays in memory.

# find_real NAME: the real tool Terminal would run, else the usual install folders.
find_real() {
  local found dir
  found="$(command -v "$1" 2>/dev/null || true)"
  if [ -z "$found" ]; then
    for dir in "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin; do
      if [ -x "$dir/$1" ]; then
        found="$dir/$1"
        break
      fi
    done
  fi
  printf '%s' "$found"
}

# version_at_least "2.1.317 (Claude Code)" 2.1.317
version_at_least() {
  local have a b c x y z
  have="$(printf '%s\n' "$1" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  [ -n "$have" ] || return 1
  IFS=. read -r a b c <<<"$have"
  IFS=. read -r x y z <<<"$2"
  if ((10#$a != 10#$x)); then ((10#$a > 10#$x)); return; fi
  if ((10#$b != 10#$y)); then ((10#$b > 10#$y)); return; fi
  ((10#$c >= 10#$z))
}

record() {
  local path version json logged_in org_id status
  path="$(find_real claude)"
  echo "claude.path=${path:-none}"
  if [ -n "$path" ]; then
    echo "claude.program=$(readlink -f "$path" 2>/dev/null || printf '%s' "$path")"
    version="$("$path" --version 2>/dev/null | head -n 1 || true)"
    echo "claude.version=${version:-none}"
    if version_at_least "$version" "$claude_minimum"; then
      json="$("$path" auth status --json 2>/dev/null || true)"
      logged_in="$(printf '%s' "$json" | plutil -extract loggedIn raw -o - - 2>/dev/null || echo unknown)"
      org_id="$(printf '%s' "$json" | plutil -extract orgId raw -o - - 2>/dev/null || echo none)"
      json=''
      echo "claude.loggedIn=$logged_in"
      echo "claude.orgId=$org_id"
    else
      # A Claude Code this old can sign itself out from its status command, so it isn't asked.
      echo "claude.loggedIn=not read (older than $claude_minimum)"
    fi
  fi
  path="$(find_real codex)"
  echo "codex.path=${path:-none}"
  if [ -n "$path" ]; then
    echo "codex.program=$(readlink -f "$path" 2>/dev/null || printf '%s' "$path")"
    version="$("$path" --version 2>/dev/null | head -n 1 || true)"
    echo "codex.version=${version:-none}"
    # Codex prints its status on standard error; its last line is the status message.
    status="$("$path" login status 2>&1 >/dev/null | awk 'NF { last = $0 } END { print last }' || true)"
    echo "codex.status=${status:-none}"
  fi
}

label() {
  case "$1" in
    claude.path) echo "Claude Code's path" ;;
    claude.program) echo "the program Claude Code's path leads to" ;;
    claude.version) echo "Claude Code's version" ;;
    claude.loggedIn) echo "Claude Code's sign-in (loggedIn)" ;;
    claude.orgId) echo "Claude Code's sign-in (orgId)" ;;
    codex.path) echo "Codex's path" ;;
    codex.program) echo "the program Codex's path leads to" ;;
    codex.version) echo "Codex's version" ;;
    codex.status) echo "Codex's sign-in (login status)" ;;
    *) echo "$1" ;;
  esac
}

# value_of KEY FILE
value_of() {
  awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); found = 1; exit }
    END { if (!found) print "(not recorded)" }' "$2"
}

# compare_real: reads the real tools again and says what changed, never the values.
compare_real() {
  local key changed=''
  record >"$real/after"
  for key in $(cut -d= -f1 "$real/before" "$real/after" | sort -u); do
    if [ "$(value_of "$key" "$real/before")" != "$(value_of "$key" "$real/after")" ]; then
      changed="${changed:+$changed, }$(label "$key")"
    fi
  done
  if [ -z "$changed" ]; then
    echo "The real Claude Code and Codex afterwards: unchanged."
    return 0
  fi
  echo "The real Claude Code and Codex afterwards: CHANGED: $changed." >&2
  return 1
}

mkdir -m 700 "$real"
record >"$real/before"

echo "Test folder: $test_dir"
echo "State: $(tr '\n' ' ' <"$test_dir/state")"
[ "$claude_state" != missing ] || echo "  (claude=missing)"
[ "$codex_state" != missing ] || echo "  (codex=missing)"
echo "Recorded the real Claude Code and Codex: sign-ins, paths and versions."

# 3. The test copy.
open_args=(-n -W)
if [ "$hidden" = 1 ]; then open_args+=(-g -j); fi
open_args+=(
  --env "TEARSHEET_DATA_DIR=$test_dir/data"
  --env "TEARSHEET_KEYCHAIN_SERVICE=Tearsheet-test"
  --env "TEARSHEET_TEST_TOOLS=$test_dir"
  --env "TEARSHEET_CLAUDE_BIN=$test_dir/tools/claude"
  --env "TEARSHEET_CODEX_BIN=$test_dir/tools/codex"
)
if [ -n "$switch_url" ]; then open_args+=(--env "TEARSHEET_SWITCH_URL=$switch_url"); fi
if [ "$hidden" = 1 ]; then open_args+=(--env "TEARSHEET_HIDDEN_WINDOW=1"); fi
open_args+=("$bundle")

if [ "$dry_run" = 1 ]; then
  echo "Dry run: the test copy would start with:"
  printf '  open'
  printf ' %q' "${open_args[@]}"
  printf '\n'
  compare_real
  exit $?
fi

# The process of this bundle's own Tearsheet, never the /Applications copy's.
app_pids() {
  ps -axwwo pid=,command= | while read -r pid cmd; do
    case "$cmd" in
      "$bundle/Contents/MacOS/Tearsheet" | "$bundle/Contents/MacOS/Tearsheet "*) echo "$pid" ;;
    esac
  done
}

# The copies of this bundle started by this run (another run's are left alone).
new_pids() {
  local pid
  for pid in $(app_pids); do
    case " $earlier_pids " in
      *" $pid "*) ;;
      *) echo "$pid" ;;
    esac
  done
}

stop_copy() {
  local pid waited=0
  for pid in $(new_pids); do kill "$pid" 2>/dev/null || true; done
  while kill -0 "$open_pid" 2>/dev/null && [ "$waited" -lt 20 ]; do
    sleep 0.5
    waited=$((waited + 1))
  done
  if kill -0 "$open_pid" 2>/dev/null; then
    for pid in $(new_pids); do kill -KILL "$pid" 2>/dev/null || true; done
  fi
  wait "$open_pid" 2>/dev/null || true
}

# A setup.log line with the test_rules event and test_mode and no_real_installers true, in any
# of the usual shapes (test_mode=true, "test_mode": true).
test_rules_on() {
  [ -f "$1" ] && awk '
    /test_rules/ &&
    /test_mode"?[[:space:]]*[=:][[:space:]]*"?true/ &&
    /no_real_installers"?[[:space:]]*[=:][[:space:]]*"?true/ { found = 1 }
    END { exit !found }
  ' "$1"
}

earlier_pids=" $(app_pids | tr '\n' ' ') "
echo "Starting the test copy (app/dist/mac-arm64/Tearsheet.app)."
interrupted=0
trap 'interrupted=1' INT TERM
open "${open_args[@]}" &
open_pid=$!

setup_log="$test_dir/data/logs/setup.log"
deadline=$((SECONDS + 20))
rules_on=0
while [ "$SECONDS" -lt "$deadline" ] && [ "$interrupted" = 0 ]; do
  if test_rules_on "$setup_log"; then
    rules_on=1
    break
  fi
  kill -0 "$open_pid" 2>/dev/null || break
  sleep 0.5
done

if [ "$rules_on" = 0 ]; then
  if [ "$interrupted" = 1 ]; then
    echo "Stopped by hand, so the test copy was stopped." >&2
    stop_copy
  elif kill -0 "$open_pid" 2>/dev/null; then
    echo "The test copy's setup log didn't show the test rules on within 20 seconds, so it was stopped." >&2
    stop_copy
  else
    wait "$open_pid" 2>/dev/null || true
    echo "The test copy quit before its setup log showed the test rules on." >&2
  fi
  compare_real || true
  exit 1
fi

echo "Test rules on (test mode, no real installers). Change the state while it runs by editing one line of:"
echo "  $test_dir/state"
echo "Waiting for the test copy to quit."
while kill -0 "$open_pid" 2>/dev/null; do
  wait "$open_pid" 2>/dev/null || true
  if [ "$interrupted" = 1 ]; then
    echo "Stopping the test copy." >&2
    stop_copy
  fi
done
echo "The test copy quit. Its data folder stays at $test_dir/data"
compare_real
