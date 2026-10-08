#!/usr/bin/env bash
# scripts/make-web-icons.sh: the PWA's icons (public/icons) from the app
# icon (assets/icon/icon.png). Re-run after the app icon changes.
# Needs ImageMagick (`convert`).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/icon/icon.png
mkdir -p public/icons
# Manifest icons (Android/desktop install).
convert "$SRC" -resize 192x192 public/icons/icon-192.png
convert "$SRC" -resize 512x512 public/icons/icon-512.png
# Maskable: the mark shrunk into the safe zone on black, so launchers can crop it to any shape.
convert "$SRC" -resize 400x400 -background black -gravity center -extent 512x512 public/icons/maskable-512.png
# iPhone home screen icon (iOS ignores the manifest icons).
convert "$SRC" -resize 180x180 public/icons/apple-touch-icon.png
echo "public/icons written"
