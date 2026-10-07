/**
 * theme/typography.ts: type roles (PLAN §8.2), all in JetBrains Mono.
 *
 * Layer: theme. Components use a role (`type.body`) and never set
 * fontSize/fontFamily themselves.
 *
 * The fonts are embedded at build time by the expo-font config plugin
 * (see app.config.ts), so they're available on the first frame with no
 * runtime loading. The family name is the font file's name without
 * extension.
 */
import type { TextStyle } from 'react-native';

/** Font family per weight. Names match the files in assets/fonts/. */
export const fonts = {
  regular: 'JetBrainsMono-Regular',
  medium: 'JetBrainsMono-Medium',
  bold: 'JetBrainsMono-Bold',
} as const;

/**
 * Upper bound for OS text scaling (PLAN §8.2). Pass to every <Text> and
 * <TextInput> as `maxFontSizeMultiplier`. 1.6 keeps rows usable at large
 * accessibility sizes without breaking layout.
 */
export const maxFontSizeMultiplier = 1.6;

/** A type role: a complete text style (family, size, line height, spacing). */
type Role = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform'>;

/**
 * Type roles from PLAN §8.2, one size step larger after the v0.3.0 device
 * test asked for better readability (2026-10-07): body 15 → 17.
 */
export const type = {
  /** `> quest_log` header. Lowercase as styled. */
  display: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30 },
  /** Tab labels: uppercase, +1 letter spacing. */
  tab: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, letterSpacing: 1, textTransform: 'uppercase' },
  /** Top-level group headers: uppercase, drawn in textBright. */
  group: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, textTransform: 'uppercase' },
  /** Task titles. */
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  /** Tags, counts, due times. */
  meta: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Notes text, drawn in textDim. */
  notes: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  /**
   * Icon glyphs next to body text (▸ ▾ [ ] > ← → ✓ …): 20% larger than
   * body (17 → 20, user request 2026-10-07). The line height stays body's,
   * so rows don't get taller and glyphs stay aligned with the title.
   */
  glyph: { fontFamily: fonts.regular, fontSize: 20, lineHeight: 24 },
  /** Icon glyphs next to meta text (≡ ◔ ↻ !): 20% larger than meta (13 → 16), same line height. */
  metaGlyph: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 18 },
} as const satisfies Record<string, Role>;

export type TypeRole = keyof typeof type;
