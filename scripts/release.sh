#!/usr/bin/env bash
# Makes a Tearsheet release that friends can download (docs/designs/first-run/first-run-setup.md,
# item 40 and §8). In order, it:
#   1. checks that the working tree is clean, the repository is public, and LICENSE and
#      THIRD-PARTY-NOTICES.md exist, plus a few things the later steps need (listed below);
#   2. builds the engine and the app with `npm run package` from app/, which makes
#      app/dist/mac-arm64/Tearsheet.app (app/electron-builder.cjs);
#   3. makes Tearsheet-<version>-arm64.dmg (the app, a link to Applications, and
#      "How to open Tearsheet.txt") and Tearsheet-<version>-arm64.zip, unzips a copy of the zip
#      and checks its signature;
#   4. writes SHA256SUMS.txt, and app/dist/notes.md from the template scripts/release/notes.md:
#      {{VERSION}} becomes the version, {{HOW_TO_OPEN}} becomes "How to open Tearsheet.txt"
#      without its title, and {{CHECKSUMS}} becomes SHA256SUMS.txt;
#   5. shows both Install-button switches and "Anthropic approval: not yet";
#   6. asks before it creates the GitHub release, and again before each upload. Nothing goes up
#      without a "y".
#
#   scripts/release.sh            makes the release
#   scripts/release.sh --dry-run  runs every check and prints each command it would run, but
#                                 builds nothing and uploads nothing
#
# A real run stops at the first failed check. A dry run reports every failed check, then exits 1.
# The script never changes the repository's visibility or settings, never pushes, and never edits
# the committed files in scripts/release/. The build is signed ad hoc, not with a Developer ID, so
# macOS blocks it on other Macs until it is opened with the first-open steps.
set -euo pipefail

repo="LBB2005/Tearsheet"
# The online off switch's file: SWITCH_URL in app/src/shared/flags.ts (design item 2).
switch_url="https://raw.githubusercontent.com/$repo/main/release/install-button.txt"

root="$(cd "$(dirname "$0")/.." && pwd)"
dist="$root/app/dist"
# electron-builder's output: productName Tearsheet, the mac "dir" target, arm64.
app="$dist/mac-arm64/Tearsheet.app"
flags="$root/app/src/shared/flags.ts"
howto="$root/scripts/release/How to open Tearsheet.txt"
template="$root/scripts/release/notes.md"

dry_run=false
case "$#:${1:-}" in
  0:) ;;
  1:--dry-run) dry_run=true ;;
  1:-h | 1:--help)
    echo "Usage: scripts/release.sh [--dry-run]"
    echo "  --dry-run  run every check and print each command, without building or uploading"
    exit 0
    ;;
  *)
    echo "Usage: scripts/release.sh [--dry-run]" >&2
    exit 2
    ;;
esac

# --- Helpers ---------------------------------------------------------------------------------

# A command as it would be typed, with paths inside the repository shown from its root.
show() {
  local arg out=""
  for arg in "$@"; do
    case "$arg" in "$root"/*) arg="${arg#"$root"/}" ;; esac
    out="$out $(printf '%q' "$arg")"
  done
  printf '%s\n' "${out# }"
}

# run <command...>: runs it, or in a dry run only prints it.
run() {
  if $dry_run; then
    echo "  would run: $(show "$@")"
  else
    echo "+ $(show "$@")"
    "$@"
  fi
}

# run_in <folder> <command...>: the same, from that folder.
run_in() {
  local dir="$1"
  shift
  if $dry_run; then
    echo "  would run in ${dir#"$root"/}/: $(show "$@")"
  else
    echo "+ (in ${dir#"$root"/}/) $(show "$@")"
    (cd "$dir" && "$@")
  fi
}

problems=0
pass() { printf '  ok    %s\n' "$1"; }
# fail <sentence> [details]: a real run stops here. A dry run counts it and carries on, so that
# every check runs.
fail() {
  printf '  STOP  %s\n' "$1"
  if [ -n "${2:-}" ]; then printf '%s\n' "$2" | sed 's/^/        /'; fi
  if $dry_run; then
    problems=$((problems + 1))
    return 0
  fi
  echo
  echo "Nothing was built or uploaded."
  exit 1
}

# A file's size, like 312M.
size() { du -h "$1" | cut -f1 | tr -d ' '; }

# ask <question>: true only for a "y". Anything else, or no answer at all, is a no.
ask() {
  local answer=""
  read -r -p "$1 [y/N] " answer || true
  case "$answer" in y | Y | yes | Yes | YES) return 0 ;; *) return 1 ;; esac
}

# "on", "off" or "unknown", from `export const INSTALL_BUTTON = true|false` in flags.ts.
install_button() {
  local value
  value="$(grep -E '^[[:space:]]*export[[:space:]]+const[[:space:]]+INSTALL_BUTTON[[:space:]:=]' "$flags" 2>/dev/null |
    sed -nE 's/^[^=]*=[[:space:]]*(true|false)([^A-Za-z0-9_].*)?$/\1/p' | head -n 1 || true)"
  case "$value" in
    true) echo "on" ;;
    false) echo "off" ;;
    *) echo "unknown (app/src/shared/flags.ts has no INSTALL_BUTTON = true or false)" ;;
  esac
}

# The online off switch's value as copies read it at launch: "on", "off" or why there's none.
online_switch() {
  local body
  if body="$(curl -fsS --proto '=https' --max-time 5 "$switch_url" 2>/dev/null | head -c 200)"; then
    body="$(printf '%s' "$body" | tr -d '[:space:]')"
    case "$body" in
      on | off) echo "$body" ;;
      *) echo "not on or off, so copies keep the value they last read" ;;
    esac
  else
    echo "not reachable"
  fi
}

# Fills the notes template into app/dist/notes.md. The template itself is never written.
fill_notes() {
  VERSION="$version" SUMS="$sums" HOWTO="$howto" awk '
    function replace_all(s, from, to,   out, i) {
      out = ""
      while ((i = index(s, from)) > 0) {
        out = out substr(s, 1, i - 1) to
        s = substr(s, i + length(from))
      }
      return out s
    }
    $0 == "{{CHECKSUMS}}" {
      while ((getline line < ENVIRON["SUMS"]) > 0) print line
      close(ENVIRON["SUMS"])
      next
    }
    $0 == "{{HOW_TO_OPEN}}" {
      # The steps without their title (the first two lines), under the notes heading above it.
      n = 0
      while ((getline line < ENVIRON["HOWTO"]) > 0) if (++n > 2) print line
      close(ENVIRON["HOWTO"])
      next
    }
    { print replace_all($0, "{{VERSION}}", ENVIRON["VERSION"]) }
  ' "$template" >"$notes"
}

# --- 1. Checks -------------------------------------------------------------------------------

if $dry_run; then echo "Dry run: every check, then each command a release would run."; echo; fi
echo "Checking before the build:"

missing=""
for tool in git gh node npm hdiutil ditto codesign shasum curl awk; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  # The other checks need these, so even a dry run stops here.
  printf '  STOP  These tools weren'"'"'t found:%s.\n\nNothing was built or uploaded.\n' "$missing"
  exit 1
fi
pass "The tools it uses are here."

version="$(node -p 'require(process.argv[1]).version' "$root/app/package.json" 2>/dev/null || true)"
semver='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
if [[ $version =~ $semver ]]; then
  pass "The version is $version (app/package.json)."
else
  fail "Couldn't read a version like 1.2.3 from app/package.json (it says \"$version\")."
  version="unknown"
fi
commit="$(git -C "$root" rev-parse HEAD)"
short="$(git -C "$root" rev-parse --short HEAD)"

changes="$(git -C "$root" status --porcelain)"
if [ -z "$changes" ]; then
  pass "The working tree is clean."
else
  count="$(printf '%s\n' "$changes" | wc -l | tr -d ' ')"
  details="$(printf '%s\n' "$changes" | head -n 10)"
  if [ "$count" -gt 10 ]; then details="$details"$'\n'"... and $((count - 10)) more"; fi
  fail "The working tree has changes that aren't committed. Commit or remove them first, so the build is exactly what's in git." "$details"
fi

if visibility="$(gh repo view "$repo" --json visibility --jq .visibility 2>&1)"; then
  if [ "$visibility" = "PUBLIC" ]; then
    pass "$repo is public."
  else
    fail "Friends can't download from a private repository. Make it public first (§8)." \
      "gh says $repo is $visibility. This script never changes it."
  fi
else
  fail "Couldn't read $repo's visibility with gh. (\`gh auth status\` says whether gh is signed in.)" "$visibility"
fi

# The release's tag is made on GitHub at this commit, so GitHub must already have it.
if gh api "repos/$repo/commits/$commit" --silent >/dev/null 2>&1; then
  pass "Commit $short is on GitHub, so the release's tag will point at the code that's built."
else
  fail "Commit $short isn't on GitHub yet (or GitHub couldn't be reached). Push it first, so the release's tag points at the code that's built."
fi

if [ "$version" != "unknown" ]; then
  if existing="$(gh release view "v$version" --repo "$repo" --json tagName 2>&1)"; then
    fail "v$version is already released on $repo. Raise \"version\" in app/package.json for a new release."
  elif printf '%s' "$existing" | grep -qi "not found"; then
    pass "v$version isn't released yet."
  else
    fail "Couldn't check whether v$version is already released on $repo." "$existing"
  fi
fi

if [ -s "$root/LICENSE" ]; then
  pass "LICENSE exists."
else
  fail "LICENSE is missing. The release needs Tearsheet's MIT licence, and the build copies it into the app."
fi
if [ -s "$root/THIRD-PARTY-NOTICES.md" ]; then
  pass "THIRD-PARTY-NOTICES.md exists."
else
  fail "THIRD-PARTY-NOTICES.md is missing. It holds the notice for the code adapted from Realm (§8), and the build copies it into the app."
fi

if [ -s "$howto" ] && [ -s "$template" ]; then
  pass "scripts/release/How to open Tearsheet.txt and scripts/release/notes.md exist."
else
  fail "scripts/release/How to open Tearsheet.txt or scripts/release/notes.md is missing."
fi

# --- 2. Build --------------------------------------------------------------------------------

dmg="$dist/Tearsheet-$version-arm64.dmg"
zip="$dist/Tearsheet-$version-arm64.zip"
sums="$dist/SHA256SUMS.txt"
notes="$dist/notes.md"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
stage="$work/dmg"
unzipped="$work/unzipped"
mkdir -p "$stage" "$unzipped"

echo
echo "Building Tearsheet $version from $short (the engine, then the app):"
run_in "$root/app" npm run package
if ! $dry_run && [ ! -d "$app" ]; then
  echo "  STOP  The build didn't make ${app#"$root"/}. Nothing was uploaded."
  exit 1
fi
# A release is never a test build (docs/test-builds.md): no marker file, and Electron's fuses off
# (electron-builder.cjs).
if $dry_run; then
  echo "  would check: no Contents/Resources/test-build.txt, and the RunAsNode, NODE_OPTIONS and --inspect fuses off"
else
  if [ -e "$app/Contents/Resources/test-build.txt" ]; then
    echo "  STOP  This is a test build (it has test-build.txt). Nothing was uploaded."
    exit 1
  fi
  fuses="$(cd "$root/app" && npx --no-install @electron/fuses read --app "$app" 2>&1 || true)"
  for fuse in RunAsNode EnableNodeOptionsEnvironmentVariable EnableNodeCliInspectArguments; do
    if ! printf '%s\n' "$fuses" | grep -q "$fuse is Disabled"; then
      echo "  STOP  Electron's $fuse fuse isn't off in the build. Nothing was uploaded."
      exit 1
    fi
  done
  pass "A release build: no test marker, and the RunAsNode, NODE_OPTIONS and --inspect fuses are off."
fi

# --- 3. DMG and zip --------------------------------------------------------------------------

echo
echo "Making the DMG and the zip:"
run rm -f "$dmg" "$zip" "$sums" "$notes"
run ditto "$app" "$stage/Tearsheet.app"
run ln -s /Applications "$stage/Applications"
run cp "$howto" "$stage/How to open Tearsheet.txt"
run hdiutil create -volname Tearsheet -srcfolder "$stage" -fs HFS+ -format UDZO "$dmg"
run ditto -c -k --keepParent --sequesterRsrc "$app" "$zip"
run ditto -x -k "$zip" "$unzipped"
verify=(codesign --verify --deep --strict --verbose=2 "$unzipped/Tearsheet.app")
if $dry_run; then
  echo "  would run: $(show "${verify[@]}"), and stop if it fails"
else
  echo "+ $(show "${verify[@]}")"
  if ! "${verify[@]}"; then
    echo "  STOP  The unzipped copy of the zip failed its signature check. Nothing was uploaded."
    exit 1
  fi
fi

# --- 4. Checksums and notes ------------------------------------------------------------------

echo
echo "Writing the checksums and the release notes:"
if $dry_run; then
  echo "  would run: (cd app/dist && shasum -a 256 ${dmg##*/} ${zip##*/}) > app/dist/SHA256SUMS.txt"
  echo "  would write app/dist/notes.md from scripts/release/notes.md, with the version, the checksums and How to open Tearsheet.txt"
else
  (cd "$dist" && shasum -a 256 "${dmg##*/}" "${zip##*/}") >"$sums"
  fill_notes
  if grep -q '{{' "$notes"; then
    echo "  STOP  app/dist/notes.md still has a {{...}} this script doesn't fill:"
    grep -n '{{' "$notes" | sed 's/^/        /'
    exit 1
  fi
  echo "  Wrote app/dist/SHA256SUMS.txt and app/dist/notes.md."
fi

# --- 5. Summary ------------------------------------------------------------------------------

echo
echo "Release v$version on $repo, built from $short:"
for f in "$dmg" "$zip" "$sums" "$notes"; do
  if $dry_run; then
    echo "  ${f#"$root"/}"
  else
    printf '  %-36s %s\n' "${f#"$root"/}" "$(size "$f")"
  fi
done
echo
echo "Install button: $(install_button)"
echo "Online off switch: $(online_switch)"
echo "Anthropic approval: not yet"
echo

# --- 6. Upload -------------------------------------------------------------------------------

create=(gh release create "v$version" --repo "$repo" --target "$commit" --title "Tearsheet $version" --notes-file "$notes")
question="Create the release v$version on $repo (public)?"

if $dry_run; then
  echo "Uploading:"
  echo "  would ask: $question [y/N]"
  echo "  would run on y: $(show "${create[@]}")"
  for f in "$dmg" "$zip" "$sums"; do
    echo "  would ask: Upload ${f##*/} to v$version? [y/N]"
    echo "  would run on y: $(show gh release upload "v$version" "$f" --repo "$repo")"
  done
  echo
  if [ "$problems" -gt 0 ]; then
    echo "The dry run found $problems problem(s). A real run would stop at the first one, before building."
    echo "Nothing was built or uploaded."
    exit 1
  fi
  echo "The dry run found no problems. Nothing was built or uploaded."
  exit 0
fi

if ! ask "$question"; then
  echo "Nothing was uploaded. The files are in app/dist/."
  exit 0
fi
run "${create[@]}"

for f in "$dmg" "$zip" "$sums"; do
  if ask "Upload ${f##*/} ($(size "$f")) to v$version?"; then
    run gh release upload "v$version" "$f" --repo "$repo"
  else
    echo "Skipped ${f##*/}. To upload it later: $(show gh release upload "v$version" "$f" --repo "$repo")"
  fi
done

echo
echo "The release: https://github.com/$repo/releases/tag/v$version"
