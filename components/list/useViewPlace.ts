/**
 * components/list/useViewPlace.ts: each view of a list keeps its own place,
 * and arrives from the side it's on (second navigation pass, 2026-10-09).
 *
 * Layer: UI. One list shows several views in turn: the quest tabs (ALL /
 * DAILY / MAIN / MISC) and, on ACTIVE, each zoom level. Before, they all
 * shared one scroll position, so switching tabs left you at an arbitrary
 * spot in the next one. Now:
 *   - leaving a view remembers where it was scrolled to; coming back
 *     restores it (zoom out of a quest and you're back where it was); a
 *     view never seen starts at the top;
 *   - the new view slides in a short way from the side it's on (`rank`:
 *     tabs left to right, deeper zoom further right) while fading in, so
 *     moving between views has a direction. Under Reduce Motion it simply
 *     appears.
 * Places are kept while the app runs, not saved.
 */
import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, space } from '@/theme';

/** The part of FlashList's handle this needs. */
interface Scrollable {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

/** How far a new view slides in from (pt). */
const SHIFT = space.lg;

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
    opacity: 1 - 0.7 * Math.abs(enter.get()),
    transform: [{ translateX: SHIFT * enter.get() }],
  }));
}

/**
 * Remembers and restores `view`'s scroll position on `list`, and animates
 * its arrival (useViewEntrance). Returns `onScroll(offsetY)` to call from
 * the list's scroll handler, and the style for the view's container.
 */
export function useViewPlace(list: RefObject<Scrollable | null>, view: string, rank: number) {
  const places = useRef(new Map<string, number>());
  const offset = useRef(0);
  const shownView = useRef(view);

  // Layout effect: runs after the list has taken the new rows, before the
  // frame is drawn, so the old position never flashes on the new rows.
  useLayoutEffect(() => {
    if (shownView.current === view) return;
    places.current.set(shownView.current, offset.current);
    shownView.current = view;
    const back = places.current.get(view) ?? 0;
    offset.current = back;
    list.current?.scrollToOffset({ offset: back, animated: false });
  }, [view, list]);

  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);

  return { onScroll, style: useViewEntrance(view, rank) };
}
