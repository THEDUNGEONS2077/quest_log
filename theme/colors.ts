/**
 * theme/colors.ts: the quest_log color tokens (PLAN §8.1).
 *
 * Layer: theme. Every color in the app comes from here; components never
 * use hex literals. The palette is green-only on pure black.
 *
 * Contrast: every *text* token is ≥ 4.5:1 (WCAG AA) on every background
 * token (bg, surface, surfaceRaised). This is enforced by
 * __tests__/theme.test.ts.
 */

/** Background tokens: surfaces that text is drawn on. */
const backgrounds = {
  /** App background. */
  bg: '#000000',
  /** Editing row, sheets, toast. */
  surface: '#060D08',
  /** Context menu, accessory bar, lifted drag row. */
  surfaceRaised: '#0B160D',
} as const;

/** Non-text decoration: dividers, nesting guides, idle borders. */
const decoration = {
  line: '#12301A',
} as const;

/** Text and icon tokens, dimmest to brightest. */
const text = {
  /**
   * Completed tasks, metadata, placeholders.
   * Note: PLAN §8.1 specified #2A8A3E, which is only 4.23:1 on surfaceRaised
   * (it fails AA). #2B903F is the smallest brightening that passes on all
   * backgrounds.
   */
  textDim: '#2B903F',
  /** Body text, icons. */
  text: '#2FB344',
  /** Focus, caret, active controls, HIGH priority, drop indicator. */
  accent: '#39FF14',
  /** Headings, group headers, active tab. */
  textBright: '#B6FFB0',
} as const;

/** All color tokens, flat, for `colors.text`-style access. */
export const colors = { ...backgrounds, ...decoration, ...text } as const;

/** Names of tokens that render text; used by the contrast test. */
export const textTokens = Object.keys(text) as (keyof typeof text)[];
/** Names of tokens that text renders on; used by the contrast test. */
export const backgroundTokens = Object.keys(backgrounds) as (keyof typeof backgrounds)[];

export type ColorToken = keyof typeof colors;

/**
 * The only allowed effect: a soft green focus glow (PLAN §8.1), used on the
 * editing row, the focused accessory button and the lifted drag row.
 * Values are spread into a style object.
 */
export const focusGlow = {
  shadowColor: colors.accent,
  shadowOpacity: 0.35,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 0 },
} as const;
