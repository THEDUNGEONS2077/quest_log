/**
 * theme/motion.ts: animation timing tokens (PLAN §8.3, §10).
 *
 * Layer: theme. All durations come from here. When Reduce Motion is on,
 * animations become instant (handled by the animation helpers added in
 * later phases, which read this module).
 */
import { Easing } from 'react-native-reanimated';

/** Standard durations in milliseconds. */
export const duration = {
  /** Small state changes: insert/delete rows, caret rotate, lift. */
  fast: 120,
  /** Default: strikethrough, toast, row collapse. */
  base: 200,
  /** Larger transitions. */
  slow: 320,
} as const;

/** Specific timings from the motion spec (PLAN §10). */
export const timing = {
  /** Block cursor `█` on/off interval. */
  cursorBlink: 530,
  /**
   * Hold after a top-level task is checked, before it slides out of ACTIVE:
   * the strike, scan and "+N XP" play in it (500 → 600 ms, 2026-10-09, so
   * the XP can be read).
   */
  completeHold: 600,
  /** Hold between strike and un-strike when a repeating task advances. */
  repeatHold: 300,
  /** Boot sequence fade-out. */
  bootFade: 160,
  /** Drop settle after a drag. */
  dropSettle: 160,
  /** Undo toast visible time. */
  toastHold: 5000,
  /** Highlight-on-open flash (two pulses). */
  highlight: 800,
  /** Long-press before a drag lifts. */
  longPress: 300,
  /** Hover over a collapsed parent before it auto-expands while dragging. */
  hoverExpand: 600,
} as const;

/** The single easing curve used everywhere. */
export const easing = Easing.out(Easing.cubic);
