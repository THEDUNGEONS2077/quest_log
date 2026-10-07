#!/usr/bin/env bash
# =============================================================================
# subset-fonts.sh: download JetBrains Mono and subset it for quest_log.
#
# Why: the full font files are ~270 KB each. We only need Latin text plus the
# box-drawing / UI glyphs listed in PLAN §8.4, so subsetting keeps the APK
# small (PLAN §5 size budgets).
#
# Output: assets/fonts/JetBrainsMono-{Regular,Medium,Bold}.ttf (committed).
# Requires: curl, unzip, pyftsubset (apt: fonttools).
# Usage:    ./scripts/subset-fonts.sh
# =============================================================================
set -euo pipefail

# Pinned font release so re-running the script gives identical files.
VERSION="2.304"
URL="https://github.com/JetBrains/JetBrainsMono/releases/download/v${VERSION}/JetBrainsMono-${VERSION}.zip"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/fonts"
WEIGHTS=(Regular Medium Bold)

# Unicode ranges to keep:
#   U+0020-007E  Basic Latin (ASCII)
#   U+00A0-00FF  Latin-1 Supplement (accented letters, ·)
#   U+0100-017F  Latin Extended-A (more accented letters in task titles)
#   U+2000-206F  General Punctuation (…, —, ‘ ’ “ ”)
#   U+2190-21FF  Arrows (↻ ↶ ⇤ ⇥ ↦ ↳ ←)
#   U+2200-22FF  Math operators (≡ ⋮)
#   U+2300-23FF  Misc technical (⌕ ⎘ ⏰)
#   U+2500-257F  Box drawing (│ ━ ┄ ┏ …)
#   U+2580-259F  Block elements (█ cursor)
#   U+25A0-25FF  Geometric shapes (▸ ▾)
#   U+2600-26FF  Misc symbols (☐ ⚙)
#   U+2700-27BF  Dingbats (✕)
#   U+2900-297F  Supplemental arrows-B (⤢)
#   U+29C9       ⧉ (duplicate)
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2000-206F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2500-257F,U+2580-259F,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+2900-297F,U+29C9"

# The §8.4 glyphs the UI actually uses; checked after subsetting.
REQUIRED_GLYPHS="▸▾≡⏰↻⌕⚙█✕↶⇤⇥⤢☐⧉↦⎘│━┄┏┓┗┛┃⋮↳←·…"

# --- 1. Download into a throwaway temp dir (an untrusted archive stays out of the repo) ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "> downloading JetBrains Mono v${VERSION}"
curl -fsSL -o "$TMP/jbm.zip" "$URL"
unzip -q "$TMP/jbm.zip" -d "$TMP/jbm"

# --- 2. Subset each weight to the ranges above ---
mkdir -p "$OUT"
for w in "${WEIGHTS[@]}"; do
  src="$TMP/jbm/fonts/ttf/JetBrainsMono-${w}.ttf"
  dst="$OUT/JetBrainsMono-${w}.ttf"
  # --layout-features='*' keeps ligature/kerning tables for the kept glyphs;
  # --no-hinting drops TrueType hinting, which phones don't need at these sizes.
  pyftsubset "$src" \
    --unicodes="$UNICODES" \
    --layout-features='*' \
    --no-hinting \
    --output-file="$dst"
  printf '> %-28s %6s KB\n' "JetBrainsMono-${w}.ttf" "$(( $(stat -c %s "$dst") / 1024 ))"
done

# --- 3. Report any required glyph the font doesn't contain ---
# The app falls back to a text alternative (for example ⏰ → RMD) for these.
python3 -I - "$OUT/JetBrainsMono-Regular.ttf" "$REQUIRED_GLYPHS" <<'PY'
import sys
from fontTools.ttLib import TTFont
cmap = TTFont(sys.argv[1]).getBestCmap()
missing = [c for c in sys.argv[2] if ord(c) not in cmap]
if missing:
    print("> MISSING glyphs (need a text fallback):", " ".join(f"{c} U+{ord(c):04X}" for c in missing))
else:
    print("> all required glyphs present")
PY
