/**
 * theme/glyphs.ts: the typographic "icon set" (PLAN §8.4).
 *
 * Layer: theme. quest_log has no icon font; every icon is a text glyph drawn
 * in JetBrains Mono. Components use `glyphs.repeat` and never inline the
 * character, so a glyph can be swapped app-wide in one place.
 *
 * Why some glyphs differ from PLAN §8.4: the subset script found that
 * JetBrains Mono v2.304 doesn't contain ⏰ ↻ ⌕ ⚙ ↶ ⇤ ⤢ ☐ ⧉ ⎘ ↳. Android would
 * draw those from a fallback system font, so they wouldn't be monospace and
 * might show as color emoji. Where the font has a close match, we use it
 * instead. `planned` records the original choice so the glyph check screen
 * (app/index.tsx, Phase 1) can show both side by side on the device.
 */

/** One glyph: what we render, what the plan specified, and whether the font has it. */
export interface Glyph {
  /** The character(s) rendered in the UI. */
  readonly glyph: string;
  /** The glyph PLAN §8.4 specified, when different. */
  readonly planned?: string;
  /** False when `glyph` itself isn't in JetBrains Mono (rendered by a system fallback font). */
  readonly inFont: boolean;
}

/** Shorthand for an entry that's in the font. */
const g = (glyph: string, planned?: string): Glyph => ({ glyph, planned, inFont: true });

export const glyphs = {
  // --- Task state ---
  checkboxOff: g('[ ]'),
  checkboxOn: g('[x]'),
  collapsed: g('▸'),
  expanded: g('▾'),

  // --- Row indicators ---
  notes: g('≡'),
  /** U+25D4: a quarter-filled circle that reads as a clock face, in-font. */
  notify: g('◔', '⏰'),
  /** No close in-font match; rendered by the system fallback font. Check on device. */
  repeat: { glyph: '↻', inFont: false } as Glyph,
  priority: g('!'),
  /** Depth badge for rows deeper than the visual indent cap (`└5`). */
  depthBadge: g('└', '↳'),
  dragHandle: g('⋮'),

  // --- Header and actions ---
  add: g('+'),
  /** `/` is vim's search key; it fits the terminal theme. */
  search: g('/', '⌕'),
  /** U+229B CIRCLED ASTERISK: gear-like, in-font. */
  settings: g('⊛', '⚙'),
  delete: g('✕'),
  undo: g('↩', '↶'),
  redo: g('↪'),
  outdent: g('←', '⇤'),
  indent: g('→', '⇥'),
  zoom: g('⊕', '⤢'),
  select: g('□', '☐'),
  duplicate: g('⊞', '⧉'),
  copy: g('⎕', '⎘'),
  moveTo: g('↦'),

  // --- Terminal chrome ---
  cursor: g('█'),
  prompt: g('>'),
} as const satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphs;
