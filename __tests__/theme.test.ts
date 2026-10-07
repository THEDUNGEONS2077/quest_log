/**
 * __tests__/theme.test.ts: guards the design system rules (PLAN §8).
 *
 * - Every text color reaches WCAG AA (≥ 4.5:1) on every background color.
 * - Spacing sits on the 4 pt grid.
 * - Motion durations match the spec.
 */
import { backgroundTokens, colors, duration, space, textTokens, timing } from '@/theme';

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  // sRGB → linear light, per the WCAG 2.x definition.
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (always ≥ 1). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('colors', () => {
  // Every (text, background) pair the UI can produce.
  const pairs = textTokens.flatMap((t) => backgroundTokens.map((b) => [t, b] as const));

  it.each(pairs)('%s on %s meets WCAG AA (≥ 4.5:1)', (t, b) => {
    expect(contrast(colors[t], colors[b])).toBeGreaterThanOrEqual(4.5);
  });

  it('matches the contrast figures documented in PLAN §8.1 (on black)', () => {
    expect(contrast(colors.text, colors.bg)).toBeCloseTo(7.6, 0);
    expect(contrast(colors.accent, colors.bg)).toBeGreaterThan(15);
  });

  it('uses only #RRGGBB hex values', () => {
    Object.values(colors).forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
  });
});

describe('spacing', () => {
  it('sits on the 4 pt grid', () => {
    Object.values(space).forEach((v) => expect(v % 4).toBe(0));
  });
});

describe('motion', () => {
  it('matches the PLAN §8.3 tokens', () => {
    expect(duration).toEqual({ fast: 120, base: 200, slow: 320 });
    expect(timing.cursorBlink).toBe(530);
  });
});
