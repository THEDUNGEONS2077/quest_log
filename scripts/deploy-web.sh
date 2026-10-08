#!/usr/bin/env bash
# scripts/deploy-web.sh: tests and publishes the web version / iPhone PWA to
# GitHub Pages (https://thedungeons2077.github.io/quest_log/).
#
# Steps (any failure stops before anything is published):
#   1. build at the site root and run the browser smoke test (e2e/web/smoke.mjs),
#   2. build again for the /quest_log/ path GitHub Pages serves it from,
#   3. publish that build as the `gh-pages` branch (replacing the old one),
#   4. turn on GitHub Pages for the branch the first time.
#
# The site is static files only: no server code, no analytics, no tracking.
# Each visitor's tasks stay in their own browser.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=THEDUNGEONS2077/quest_log
BASE=/quest_log
URL="https://thedungeons2077.github.io$BASE/"

# Publish only committed code, so the site matches a commit.
[ -z "$(git status --porcelain)" ] || { echo "✕ uncommitted changes; commit first" >&2; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"

# 1. Build and test (the smoke test serves the root build).
npm run web:export
npm run web:test

# 2. The real build for GitHub Pages' path.
QUESTLOG_WEB_BASE="$BASE" npm run web:export

# 3. Replace the gh-pages branch with this build (a fresh one-commit branch: no history kept).
TMP="$(mktemp -d)"
cp -r web-dist/. "$TMP/"
git -C "$TMP" init -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "Web build of $COMMIT"
git -C "$TMP" push -q --force "$(git remote get-url origin)" gh-pages
rm -rf "$TMP"
echo "✓ gh-pages updated (build of $COMMIT)"

# 4. Enable Pages on the branch if it isn't yet (GitHub then builds the site in a minute or two).
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null
  echo "✓ GitHub Pages enabled"
fi
echo "✓ deployed: $URL (live once GitHub finishes publishing)"
