#!/bin/sh
# Builds every graphic from design/make_graphics.py. Run from anywhere: sh design/build.sh
# Needs python3 and Inkscape 1.x. Nothing is downloaded.
set -eu

INKSCAPE="${INKSCAPE:-/opt/homebrew/bin/inkscape}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
SRC="$HERE/src"

python3 "$HERE/make_graphics.py" "$SRC"

mkdir -p "$ROOT/.storybook/static"

# Favicon: plain SVG for the app and for Storybook, PNG fallbacks for browsers and phones that want one.
"$INKSCAPE" "$SRC/favicon.svg" --export-plain-svg --export-filename="$ROOT/public/favicon.svg"
"$INKSCAPE" "$SRC/favicon.svg" --export-type=png --export-width=48 --export-filename="$ROOT/public/favicon-48.png"
"$INKSCAPE" "$SRC/favicon.svg" --export-type=png --export-width=180 --export-filename="$ROOT/public/apple-touch-icon.png"
cp "$ROOT/public/favicon.svg" "$ROOT/.storybook/static/favicon.svg"

# Storybook brand: text turned into paths, so it needs no font where it is shown.
"$INKSCAPE" "$SRC/storybook-brand.svg" --export-text-to-path --export-plain-svg --export-filename="$ROOT/.storybook/static/brand.svg"

# Social card, 1200 by 630.
"$INKSCAPE" "$SRC/social.svg" --export-type=png --export-width=1200 --export-height=630 --export-filename="$ROOT/public/social.png"

# Drop text and time chunks from the PNGs.
python3 "$HERE/strip_png.py" "$ROOT/public/favicon-48.png" "$ROOT/public/apple-touch-icon.png" "$ROOT/public/social.png"
