/**
 * theme/spacing.ts: spacing, sizing and shape tokens (PLAN §8.3).
 *
 * Layer: theme. Everything sits on a 4 pt grid, except hairline borders.
 */

/** Spacing scale (4 pt grid). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Fixed layout sizes. */
export const size = {
  /** Horizontal indent per tree depth level (20 → 24 with the larger text). */
  indent: 24,
  /** Indentation stops growing past this depth; deeper rows show a depth badge. */
  maxVisualDepth: 4,
  /** Minimum task row height (48 → 52: easier to hit, PLAN §13). */
  rowMinHeight: 52,
  /** Minimum tap target (width and height) for anything tappable. */
  hitTarget: 44,
  /** Height of the editing toolbar's buttons (EditToolbar), excluding the safe-area inset. */
  toolbarHeight: 56,
  /** Max content width, so split-screen and large phones stay readable. */
  maxContentWidth: 640,
} as const;

/** Shape tokens: square-ish terminal look. */
export const shape = {
  radius: 2,
  /** 1 pt borders and dividers (deliberately off the 4 pt grid). */
  hairline: 1,
  /** Strikethrough line thickness (PLAN §9.5). */
  strike: 1.5,
  /**
   * Letter spacing for the `[ ]` / `[x]` checkbox: pulls the brackets in,
   * so the box reads as one compact control (user request 2026-10-07).
   */
  checkboxTracking: -4,
  /** Drop indicator thickness while dragging (PLAN §9.10). */
  dropIndicator: 2,
} as const;
