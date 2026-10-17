/**
 * components/list/useFoldFocus.ts: where a list stands when a task's
 * subtasks fold open or shut (user request 2026-10-17: "I want a quest to
 * be in focus when it's expanded … when the quest is collapsed it should
 * stay in the position it is in … the app should not change the position
 * of the quest when it is collapsed").
 *
 * Layer: UI.
 *   - **Opening focuses the task.** Once its subtasks are laid out, if
 *     they don't all fit on screen below it (or its own row is cut off at
 *     the top), the list scrolls so the task's title is at the top of the
 *     list and its subtasks fill the screen below. If they fit, nothing
 *     moves: a small group opens where it is.
 *   - **Closing never moves the task.** Below it the list gets shorter; near
 *     the end of the list it would end up shorter than the screen, and a
 *     scroll view can't stay scrolled past its end: everything would jump
 *     down. So when a fold starts to close, the list gets extra room at its
 *     end ("slack"): what the view will reach past the shorter list, plus
 *     the rows going away. (The plus: as rows go, FlashList first lays the
 *     rows that move up out at the heights of the rows that were in their
 *     places, so for a moment the list can be shorter still, and a scroll
 *     view clamps its position the moment it is: 2026-10-17, a closed quest
 *     slid down 24 pt.) Once the fold has played, the slack shrinks to what
 *     the view still reaches into, and later only ever shrinks further, as
 *     you scroll back up: nothing on screen moves because of it. Trimming
 *     allows SLACK_MARGIN for a scroll position a few points out of date
 *     (the last scroll event of a glide can go unreported: a closed quest
 *     sometimes moved by those few points, 2026-10-17); where the content
 *     ends well below the screen, the slack still goes entirely.
 * Rows' places come from FlashList's layouts (an item's place on the list
 * is its layout's y plus the first item's offset; scroll offsets are on the
 * same scale). The view's height and the content's end come from the
 * scroll view itself (its layout and content-size events): FlashList's own
 * figures for them were 24 pt off, enough for the list to jump.
 */
import type { FlashListRef } from '@shopify/flash-list';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useReduceMotion } from '@/components/common/motion';
import type { Row } from '@/lib/flatten';
import { useAppStore, useStoreBundle } from '@/store/react';

/** The index of the last row of `index`'s subtasks now listed (`index` itself when none are). */
export function blockEnd(rows: readonly Row[], index: number): number {
  const depth = rows[index]!.depth;
  let end = index;
  while (end + 1 < rows.length && rows[end + 1]!.depth > depth) end++;
  return end;
}

/** Where the list is and what it shows, in scroll offsets (pt). */
export interface ListView {
  /** The scroll offset: the list's position at the top of its view. */
  offset: number;
  /** The view's height. */
  height: number;
  /** Shown from here down: what's above, `offset` to `offset + topTuck`, is tucked under the header. */
  topTuck: number;
  /** Covered at the bottom by what floats over the list (the quick-add bar, the keyboard). */
  coveredBottom: number;
}

/**
 * Where to scroll for a task that has just opened, from its block (its own
 * row's top to its last subtask's bottom, as list positions), or null to
 * stay. Its row at the top when the block doesn't fit on screen below it,
 * or when the row itself is cut off at the top.
 */
export function focusOffset(blockTop: number, blockBottom: number, view: ListView): number | null {
  const visibleBottom = view.offset + view.height - view.coveredBottom;
  // Its row's top at or below the view's top: its divider (on ACTIVE) sits in the tucked strip.
  const fits = blockTop >= view.offset - 0.5 && blockBottom <= visibleBottom + 0.5;
  return fits ? null : Math.max(0, blockTop);
}

/**
 * The slack (extra room at the end) that keeps the view where it is when
 * the content ends at `contentEnd` (without slack): what the view reaches
 * past it, if anything.
 */
export function slackNeeded(contentEnd: number, view: Pick<ListView, 'offset' | 'height'>): number {
  return Math.max(0, Math.ceil(view.offset + view.height - contentEnd));
}

/**
 * How far the scroll position the list knows can be behind the real one
 * (pt): the last scroll event of a glide can go unreported. Trimming the
 * slack allows this much, so a trim never pulls the view back.
 */
export const SLACK_MARGIN = 24;

/**
 * How long after a focus glide starts its target still stands for where the
 * view is (ms): the glide (about 250 ms on Android) and its last, possibly
 * unreported, scroll event.
 */
const FOCUS_GLIDE_MS = 1500;

/**
 * The slack after a trim: never more than before, and never less than what
 * the view reaches past the content's end, allowing SLACK_MARGIN; nothing at
 * all once the content ends that far below the view.
 */
export function trimSlack(slack: number, contentEnd: number, view: Pick<ListView, 'offset' | 'height'>): number {
  return Math.min(slack, slackNeeded(contentEnd, { offset: view.offset + SLACK_MARGIN, height: view.height }));
}

/**
 * What the scroll view last reported: its height, its content's height with
 * the slack it had then, and its scroll offset (null until it scrolls).
 */
interface Measured {
  height: number;
  content: number;
  contentSlack: number;
  offset: number | null;
}

/**
 * The list's view now, where its first item starts, and where its content
 * ends without slack: from the scroll view's own reports once it has made
 * them, from FlashList's figures until then.
 */
function viewOf(l: FlashListRef<Row>, measured: Measured, topTuck: number, coveredBottom: number, padBottom: number) {
  const first = l.getFirstItemOffset();
  const height = measured.height || l.getWindowSize().height;
  const view: ListView = { offset: measured.offset ?? l.getAbsoluteLastScrollOffset(), height, topTuck, coveredBottom };
  const contentEnd = measured.content ? measured.content - measured.contentSlack : first + l.getChildContainerDimensions().height + padBottom;
  return { first, view, contentEnd };
}

interface Options {
  /** The content's bottom padding without the slack (the quick-add bar's room, the keyboard's). */
  padBottom: number;
  /** The strip at the top tucked under the header (ACTIVE: the first quest's divider). */
  topTuck: number;
  /** Covered at the bottom by what floats over the list. */
  coveredBottom: number;
  /** This list is the one on screen (it scrolls only then). */
  shown: boolean;
  /** The view shown (tab, zoom level): a new one starts without slack. */
  viewKey: string;
}

/**
 * For one list: focuses a task its user opens and keeps it still as it
 * closes. Returns the `slack` to add to the content's bottom padding, and
 * the scroll view's handlers: `onScroll(y)` from the list's own scroll
 * handler, `onScrollEnd` for its drag and momentum ends (the slack shrinks
 * to what's still needed), `onLayout` and `onContentSizeChange` (the view's
 * true height and the content's end).
 */
export function useFoldFocus(listRef: RefObject<FlashListRef<Row> | null>, rows: readonly Row[], options: Options) {
  const { padBottom, topTuck, coveredBottom, shown, viewKey } = options;
  const reduceMotion = useReduceMotion();
  const [slack, setSlack] = useState(0);
  // A new view (tab, zoom level) starts without slack. (The previous-props pattern.)
  const [slackView, setSlackView] = useState(viewKey);
  if (slackView !== viewKey) {
    setSlackView(viewKey);
    setSlack(0);
  }

  // The scroll view's own reports, and the slack its content had when it last reported.
  const measured = useRef<Measured>({ height: 0, content: 0, contentSlack: 0, offset: null });
  // The last focus glide: where it goes, and when it started. Until it's surely over, the view
  // counts as being there already (a fold closing mid-glide must make room for where it ends).
  const glide = useRef<{ to: number; at: number } | null>(null);
  /** The view's offset for room-making: where it is, or where a focus glide under way will leave it. */
  const offsetFor = useCallback((view: ListView): ListView => {
    const g = glide.current;
    return g && performance.now() - g.at < FOCUS_GLIDE_MS ? { ...view, offset: Math.max(view.offset, g.to) } : view;
  }, []);
  const slackShown = useRef(0);
  useEffect(() => {
    slackShown.current = slack;
  }, [slack]);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    measured.current.height = e.nativeEvent.layout.height;
  }, []);

  const { store } = useStoreBundle();
  /**
   * Shrinks the slack to what the view still reaches into (never grows it).
   * Not while a fold plays: the rows are still on their way.
   */
  const settle = useCallback(() => {
    const l = listRef.current;
    if (!l || store.getState().folding.length) return;
    const m = viewOf(l, measured.current, topTuck, coveredBottom, padBottom);
    setSlack((s) => trimSlack(s, m.contentEnd, offsetFor(m.view)));
  }, [listRef, store, offsetFor, topTuck, coveredBottom, padBottom]);

  /** Every scroll position the scroll view reports (the list's own onScroll passes it on). */
  const onScroll = useCallback((y: number) => {
    measured.current.offset = y;
  }, []);
  /** A drag or a glide ended: its event has the exact position. Settle. */
  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      measured.current.offset = e.nativeEvent.contentOffset.y;
      settle();
    },
    [settle],
  );

  // The content's size changed (its final layout, after any in-between one): settle, next frame.
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      measured.current.content = height;
      measured.current.contentSlack = slackShown.current;
      requestAnimationFrame(settle);
    },
    [settle],
  );

  // Closing: as a fold starts (its subtasks still listed, fading), make room at the end for
  // what it will take away, if the view reaches that far.
  const folding = useAppStore((s) => s.folding);
  const seenFolding = useRef<readonly string[]>([]);
  useEffect(() => {
    const before = seenFolding.current;
    seenFolding.current = folding;
    const l = listRef.current;
    if (!l || !shown) return;
    let removed = 0;
    for (const id of folding) {
      if (before.includes(id)) continue;
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) continue;
      for (let i = index + 1; i <= blockEnd(rows, index); i++) removed += l.getLayout(i)?.height ?? 0;
    }
    if (!removed) {
      // A fold just finished (none playing now): the rows are where they'll stay. Settle.
      if (!folding.length && before.length) {
        const frame = requestAnimationFrame(settle);
        return () => cancelAnimationFrame(frame);
      }
      return;
    }
    const m = viewOf(l, measured.current, topTuck, coveredBottom, padBottom);
    // What the view will reach past the shorter list (where a focus glide under way will leave
    // it), plus the rows going (see the header).
    const need = slackNeeded(m.contentEnd - removed, offsetFor(m.view)) + Math.ceil(removed);
    // On the next frame (well before the fold closes, after its subtasks' fade).
    const frame = requestAnimationFrame(() => setSlack((s) => Math.max(s, need)));
    return () => cancelAnimationFrame(frame);
  }, [folding, rows, listRef, shown, settle, offsetFor, topTuck, coveredBottom, padBottom]);

  // Opening: focus the task once its subtasks are laid out.
  const focus = useAppStore((s) => s.foldFocus);
  const focused = useRef(0);
  useEffect(() => {
    if (!focus || focus.key === focused.current || !shown) return;
    const index = rows.findIndex((r) => r.id === focus.id);
    // Not in this list, or its subtasks aren't listed yet (they come with the next rows).
    if (index < 0 || blockEnd(rows, index) === index) return;
    focused.current = focus.key;
    // Two frames: FlashList lays the new rows out in the first.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        // Closed again before its focus began: it stays where it is. (Once the list is gliding
        // it finishes: stopping it at a position the list only knows a frame or two late would
        // jolt it back.)
        if (store.getState().folding.includes(focus.id)) return;
        const l = listRef.current;
        const top = l?.getLayout(index);
        const last = l?.getLayout(blockEnd(rows, index));
        if (!l || !top || !last) return;
        const m = viewOf(l, measured.current, topTuck, coveredBottom, padBottom);
        const to = focusOffset(m.first + top.y, m.first + last.y + last.height, m.view);
        if (to === null) return;
        l.scrollToOffset({ offset: to, animated: !reduceMotion });
        // Where it ends up (the scroll view stops at its end), in case its last event goes unreported.
        const end = measured.current.content ? Math.max(0, measured.current.content - m.view.height) : to;
        glide.current = { to: Math.min(to, end), at: performance.now() };
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, rows, listRef, store, shown, reduceMotion, topTuck, coveredBottom, padBottom]);

  return { slack, onScroll, onScrollEnd, onLayout, onContentSizeChange };
}
