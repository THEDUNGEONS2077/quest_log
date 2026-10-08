#!/usr/bin/env bash
# scripts/make-widget-preview.sh: draws the widget picker's preview image
# (assets/widget/preview.png) in the app's style, from sample rows.
# Needs ImageMagick (`convert`) and the subset fonts in assets/fonts.
set -euo pipefail

# Run from the repo root, wherever the script is called from.
cd "$(dirname "$0")/.."

# Theme colors (theme/colors.ts): bg, line, accent, text, textDim.
BG='#000000'; LINE='#12301A'; ACCENT='#39FF14'; TEXT='#2FB344'; DIM='#2B903F'
REG=assets/fonts/JetBrainsMono-Regular.ttf
BOLD=assets/fonts/JetBrainsMono-Bold.ttf

# 4×2 layout at 2x density (right-hand labels are right-aligned with NorthEast gravity): 640×300, header then four rows split by hairlines.
convert -size 640x300 "xc:$BG" \
  -stroke "$LINE" -strokewidth 2 -fill none -draw "rectangle 1,1 638,298" \
  -draw "line 24,80 616,80" -draw "line 24,135 616,135" -draw "line 24,190 616,190" -draw "line 24,245 616,245" \
  -stroke none \
  -font "$BOLD" -pointsize 28 -fill "$ACCENT" -annotate +24+52 '> quest_log' \
  -font "$REG" -pointsize 22 -fill "$DIM" -annotate +440+50 '12 ACTIVE' \
  -font "$BOLD" -pointsize 40 -fill "$ACCENT" -annotate +590+56 '+' \
  -font "$REG" -pointsize 26 -fill "$TEXT" \
  -annotate +24+117 '[ ] Call the bank' -annotate +24+172 '[ ] Ship v2 build' \
  -annotate +24+227 '[ ] Weekly review' -annotate +24+282 '[ ] Proofread' \
  -pointsize 22 -fill "$ACCENT" -annotate +370+170 '!!!' \
  -gravity NorthEast -annotate +24+93 'OVERDUE' \
  -fill "$DIM" -annotate +24+148 '17:00' -annotate +24+203 'FRI 16:00' \
  assets/widget/preview.png
echo "assets/widget/preview.png written"
