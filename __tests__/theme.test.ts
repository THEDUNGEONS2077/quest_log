/**
 * __tests__/theme.test.ts: guards the design system rules (PLAN §8).
 *
 * - Every text color reaches WCAG AA (≥ 4.5:1) on every background color.
 * - Spacing sits on the 4 pt grid.
 * - Motion durations match the spec, the store's waits match the
 *   animations they wait for, and components take every animation number
 *   from the motion tokens (animation pass 2026-10-09).
 * - Every phosphor effect (theme/effects.ts) parses with React Native's own
 *   parser: a gradient it rejects is silently not drawn.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { ADVANCE_MS, FOLD_DEFER_MS, FOLD_FADE_MS, FOLD_MS, GLIDE_TAIL_MS, LINGER_MS } from '@/store/createStore';
import processBackgroundImage from 'react-native/Libraries/StyleSheet/processBackgroundImage';
import processBackgroundRepeat from 'react-native/Libraries/StyleSheet/processBackgroundRepeat';
import processBackgroundSize from 'react-native/Libraries/StyleSheet/processBackgroundSize';

import { backgroundTokens, colors, distance, duration, effects, scanlineTile, space, textTokens, timing } from '@/theme';

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  // sRGB → linear light, per the WCAG 2.x definition.
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
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

  it("the store's waits last exactly as long as the animations they wait for", () => {
    // A completed quest: hold, then slide and fade (base); its row releases it when the fade
    // is done. The store's fallback must not cut that short, even with the row's animation
    // starting a render late; and the glide must outlast the rows' move (slow).
    expect(LINGER_MS).toBeGreaterThanOrEqual(timing.completeHold + duration.base + 200);
    expect(GLIDE_TAIL_MS).toBeGreaterThan(duration.slow);
    // A repeating task: strike, hold, then un-strike with its next date.
    expect(ADVANCE_MS).toBe(duration.base + timing.repeatHold);
    // Folds: a closing task's subtasks have faded (fast) before it closes; the glide is on a frame
    // or two before anything moves; and the marks outlast the rows' glide (slow).
    expect(FOLD_FADE_MS).toBeGreaterThanOrEqual(duration.fast + 16);
    expect(FOLD_DEFER_MS).toBeGreaterThanOrEqual(16);
    expect(FOLD_MS).toBeGreaterThan(duration.slow + 100);
  });

  it('distances sit on the 4 pt grid', () => {
    Object.values(distance).forEach((v) => expect(v % 4).toBe(0));
  });

  it('components take animation numbers from the tokens, and use one shared-value style', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    ['app', 'components'].forEach((d) => walk(join(root, d)));
    const problems: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const rel = file.slice(root.length + 1);
      // A literal duration (other than 0, an instant switch) belongs in theme/motion.ts.
      if (/duration: [1-9]/.test(src)) problems.push(`${rel}: literal animation duration`);
      // Reanimated 4 style: .get() / .set(), never .value.
      if (/\b\w+\.value\b/.test(src.replace(/nativeEvent\.\w+(\.\w+)*/g, ''))) problems.push(`${rel}: shared value .value`);
      // The glow color belongs in theme/colors.ts (glowShadow, glowText).
      if (src.includes('rgba(57')) problems.push(`${rel}: literal glow color`);
      // Layout "entering"/"exiting" animations are unreliable in recycled rows and modals.
      if (/\b(entering|exiting)=\{/.test(src)) problems.push(`${rel}: layout animation`);
    }
    expect(problems).toEqual([]);
  });
});

describe('app.config accent', () => {
  it('matches the theme accent (it is duplicated because app.config runs in Node)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- read the file as text, not as a module
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.config.ts'), 'utf8');
    expect(src).toContain(`const ACCENT = '${colors.accent}'`);
  });
});

describe('phosphor effects (theme/effects.ts)', () => {
  it.each(Object.entries(effects))('%s parses as a background image', (_name, css) => {
    const parsed = processBackgroundImage(css);
    expect(Array.isArray(parsed) ? parsed.length : 0).toBe(1);
  });

  it('the scanline tile parses (size and repeat)', () => {
    expect(processBackgroundSize(scanlineTile.size)).toHaveLength(1);
    expect(processBackgroundRepeat(scanlineTile.repeat)).toHaveLength(1);
  });
});
