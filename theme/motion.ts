/**
 * theme/motion.ts: animation tokens (PLAN §8.3, §10): durations, the one
 * easing curve, specific timings, distances and scales.
 *
 * Layer: theme. Every animation takes its numbers from here, so similar
 * moves match across the app: every small arrival travels `distance.nudge`,
 * every "+N XP" floats with the same rhythm, and so on (animation pass
 * 2026-10-09). When Reduce Motion is on, animations end at once
 * (components/common/motion.tsx).
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
  /** Undo toast visible time. */
  toastHold: 5000,
  /** Highlight-on-open flash (two pulses). */
  highlight: 800,
  /** Long-press before a drag lifts. */
  longPress: 300,
  /** Hover over a collapsed parent before it auto-expands while dragging. */
  hoverExpand: 600,
  /** How long a floating "+N XP" stays fully visible (between a fast fade-in and a slow fade-out). */
  floatHold: 450,
} as const;

/** How far things travel (pt). */
export const distance = {
  /** A small arrival: the toast rising into place, a view sliding in from its side, the XP bar's "+N". */
  nudge: 16,
  /** "+N XP" rising from a completed row. */
  float: 24,
  /** A completed quest sliding out of ACTIVE. */
  exit: 48,
  /** A bottom sheet rising into place. */
  sheet: 72,
} as const;

/** Scales. */
export const scale = {
  /** The lifted drag row: a slight lift (PLAN §9.10). */
  lift: 1.02,
  /** The checkbox's pop when a task is checked. */
  pop: 1.3,
} as const;

/** The single easing curve used everywhere. */
export const easing = Easing.out(Easing.cubic);
