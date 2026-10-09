/**
 * components/list/useViewPlace.ts: each view of a list keeps its own place,
 * and arrives from the side it's on (second navigation pass, 2026-10-09).
 *
 * Layer: UI. One list shows several views in turn: the quest tabs (ALL /
 * DAILY / MAIN / MISC) and, on ACTIVE, each zoom level. Before, they all
 * shared one scroll position, so switching tabs left you at an arbitrary
 * spot in the next one. Now:
 *   - **a quest tab always opens at the top** (user request 2026-10-09):
 *     switching tab (`group`) forgets every remembered place;
 *   - within a tab, leaving a zoom level remembers where it was scrolled to,
 *     and coming back restores it (zoom out of a quest and you're back where
 *     it was); a level never seen starts at the top;
 *   - a list that's hidden when its view changes (ACTIVE while COMPLETED is
 *     shown) scrolls when it's shown again: a hidden list can't scroll;
 *   - the new view slides in a short way from the side it's on (`rank`:
 *     tabs left to right, deeper zoom further right) while fading in, so
 *     moving between views has a direction. Under Reduce Motion it simply
 *     appears.
 * Places are kept while the app runs, not saved.
 */
import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { distance, duration, easing } from '@/theme';

/** The part of FlashList's handle this needs. */
interface Scrollable {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

/** How much of a new view shows at once (it fades in from here): never a blank frame. */
const ENTER_OPACITY = 0.3;

/**
 * The arrival of a new `view`: it slides in from the side it's on (`rank`
 * above the previous view's: from the right) while fading in. Returns the
 * style for the view's container.
 */
export function useViewEntrance(view: string, rank: number) {
  const shown = useRef({ view, rank });
  // -1 = arriving from the left, 1 = from the right, 0 = in place.
  const enter = useSharedValue(0);
  useLayoutEffect(() => {
    const before = shown.current;
    if (before.view === view) return;
    shown.current = { view, rank };
    enter.set(rank >= before.rank ? 1 : -1);
    enter.set(withTiming(0, { duration: duration.base, easing }));
  }, [view, rank, enter]);
  return useAnimatedStyle(() => ({
    opacity: 1 - (1 - ENTER_OPACITY) * Math.abs(enter.get()),
    transform: [{ translateX: distance.nudge * enter.get() }],
  }));
}

interface Options {
  /** The quest tab: a new one starts at the top, whatever was remembered. */
  group: string;
  /** Whether the list is on screen now (a hidden list can't scroll; it catches up when shown). */
  visible: boolean;
}

/**
 * Sets `list`'s scroll position for each `view` (see the file header) and
 * animates its arrival (useViewEntrance). Returns `onScroll(offsetY)` to
 * call from the list's scroll handler, and the style for the view's container.
 */
export function useViewPlace(list: RefObject<Scrollable | null>, view: string, rank: number, { group, visible }: Options) {
  const places = useRef(new Map<string, number>());
  const offset = useRef(0);
  const shown = useRef({ view, group });
  // Where the list must go once it can (it may be hidden right now).
  const pending = useRef<number | null>(null);

  // Layout effects: they run after the list has taken the new rows, before the
  // frame is drawn, so the old position never flashes on the new rows.
  useLayoutEffect(() => {
    const before = shown.current;
    if (before.view === view) return;
    if (before.group !== group) places.current.clear();
    else places.current.set(before.view, offset.current);
    shown.current = { view, group };
    const target = places.current.get(view) ?? 0;
    offset.current = target;
    pending.current = target;
  }, [view, group]);

  useLayoutEffect(() => {
    const target = pending.current;
    if (!visible || target === null) return;
    pending.current = null;
    const go = () => list.current?.scrollToOffset({ offset: target, animated: false });
    go();
    // Once more after the new rows are measured: the list keeps rows that were on
    // screen in place (maintainVisibleContentPosition) and could pull the view back
    // to where a quest shown on both tabs was.
    const frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [view, group, visible, list]);

  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);

  return { onScroll, style: useViewEntrance(view, rank) };
}
