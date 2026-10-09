/**
 * components/list/useViewPlace.ts: where a list's view opens, and how it
 * arrives (navigation passes 2026-10-09 and 2026-10-10).
 *
 * Layer: UI. One list shows several views in turn: the quest tabs (ALL /
 * DAILY / MAIN / MISC) and, on ACTIVE, each zoom level.
 *   - **Every tab switch opens at the top** (user requests 2026-10-09 and
 *     2026-10-10): a quest tab change, and the list being shown again
 *     (ACTIVE ↔ COMPLETED). The list is mounted afresh for each one
 *     (`listKey`), so nothing can carry an old position over: not FlashList,
 *     which keeps rows that were on screen in place when the data changes
 *     (maintainVisibleContentPosition: ALL and MAIN share quests), and not a
 *     hidden list, which can't scroll. Scrolling an existing list to the top
 *     proved unreliable for both reasons.
 *   - Within a tab, leaving a zoom level remembers where it was scrolled to,
 *     and coming back restores it (zoom out of a quest and you're back where
 *     it was); a level never seen starts at the top.
 *   - The new view slides in a short way from the side it's on (`rank`:
 *     tabs left to right, deeper zoom further right) while fading in, so
 *     moving between views has a direction. Under Reduce Motion it simply
 *     appears.
 * Places are kept while the app runs, not saved.
 */
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
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
  /** The quest tab: a new one opens at the top. */
  tab: string;
  /** Whether the list is on screen: shown again (ACTIVE ↔ COMPLETED), it opens at the top. */
  visible: boolean;
}

/**
 * Where `list` opens for each view (see the file header). Returns `listKey`
 * (give it to the list as its React key: it changes on every tab switch),
 * `onScroll(offsetY)` to call from the list's scroll handler, and the style
 * for the view's container.
 */
export function useViewPlace(list: RefObject<Scrollable | null>, view: string, rank: number, { tab, visible }: Options) {
  // Counts tab switches: a new quest tab, or the list shown again after being hidden.
  const [visits, setVisits] = useState({ tab, visible, count: 0 });
  let count = visits.count;
  if (visits.tab !== tab || visits.visible !== visible) {
    if (visits.tab !== tab || (visible && !visits.visible)) count++;
    setVisits({ tab, visible, count });
  }
  const listKey = `${tab}:${count}`;

  const places = useRef(new Map<string, number>());
  const offset = useRef(0);
  const shown = useRef({ view, listKey });

  // Layout effect: runs after the list has taken the new rows, before the frame is
  // drawn, so the old position never flashes on the new rows.
  useLayoutEffect(() => {
    const before = shown.current;
    if (before.view === view && before.listKey === listKey) return;
    shown.current = { view, listKey };
    if (before.listKey !== listKey) {
      // A tab switch: a fresh list, at the top. Nothing earlier applies.
      places.current.clear();
      offset.current = 0;
      return;
    }
    // A zoom level within the tab: remember the old one, restore the new one.
    places.current.set(before.view, offset.current);
    const target = places.current.get(view) ?? 0;
    offset.current = target;
    const go = () => list.current?.scrollToOffset({ offset: target, animated: false });
    go();
    // Once more after the new rows are measured (the list may adjust its position then).
    const frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [view, listKey, list]);

  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);

  return { listKey, onScroll, style: useViewEntrance(view, rank) };
}
