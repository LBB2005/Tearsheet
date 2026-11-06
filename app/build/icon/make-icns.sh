#!/bin/bash
# Builds app/build/icon.icns (the packaged app's icon) and app/build/icon.png (the Dock icon in
# development) from the two SVG drawings in this folder. icon-small.svg is used for the 16 and 32
# pixel images, icon.svg for the rest. Needs Google Chrome (to draw the SVG); sips and iconutil
# come with macOS. Run it again after changing either SVG.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
build="$(dirname "$here")"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Draw an SVG at 1024 × 1024 on a transparent background.
render() {
  printf '<html><body style="margin:0;background:transparent"><img src="file://%s" width="1024" height="1024"></body></html>' "$1" >"$tmp/page.html"
  "$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=1024,1024 \
    --screenshot="$2" "file://$tmp/page.html" >/dev/null 2>&1
}
render "$here/icon.svg" "$tmp/master.png"
render "$here/icon-small.svg" "$tmp/small.png"

set="$tmp/icon.iconset"
mkdir "$set"
scale() { sips -z "$2" "$2" "$tmp/$1.png" --out "$set/$3" >/dev/null; }
scale small 16 icon_16x16.png
scale small 32 icon_16x16@2x.png
scale small 32 icon_32x32.png
scale master 64 icon_32x32@2x.png
scale master 128 icon_128x128.png
scale master 256 icon_128x128@2x.png
scale master 256 icon_256x256.png
scale master 512 icon_256x256@2x.png
scale master 512 icon_512x512.png
cp "$tmp/master.png" "$set/icon_512x512@2x.png"

iconutil -c icns "$set" -o "$build/icon.icns"
cp "$tmp/master.png" "$build/icon.png"
echo "Wrote $build/icon.icns and $build/icon.png"
