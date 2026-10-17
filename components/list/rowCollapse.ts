/**
 * components/list/rowCollapse.ts: a row leaving its list closes its gap
 * smoothly; the rows below glide up instead of jumping (animation pass
 * 2026-10-11: "when completing a task the animation is a little janky when
 * the task disappears").
 *
 * Layer: UI. FlashList places its rows itself and can't animate one away:
 * a completed quest that had slid out left a gap that closed in one frame.
 * (React Native's LayoutAnimation, which FlashList supports, is switched
 * off on Android in this React Native version: `enableLayoutAnimationsOn-
 * Android` defaults to false.) But FlashList does re-measure a row whenever
 * its size changes on its own, and moves the rows below to fit. So the
 * leaving row shrinks the space it takes, from its full height to nothing,
 * on the UI thread, and the rows below follow it up; then the store
 * removes it.
 *
 * The space is taken away with a negative bottom margin (not a height), so
 * nothing has to be "unset" afterwards: a row reused by the list for
 * another task simply gets 0 again (useSameItem). The row also fades as it
 * goes, so the rows gliding over it never show what's underneath.
 * With Reduce Motion it's immediate (the store change runs at once).
 *
 * Folds (2026-10-17, see GlideCell.tsx): a subtask whose task closes gives
 * up its room at once (the same negative margin: its cell is now 0 tall, so
 * the rows below glide up) but keeps drawing where it is, fading, under the
 * rows passing over it; one whose task opens fades in where it appears.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useSameItem } from '@/components/common/motion';
import { duration, easing, easingExit, easingFold } from '@/theme';

/** How a row leaves (see useRowLeave). */
interface Leave {
  /** The store change that removes the row, run once its space is closed. */
  then?: () => void;
  /** Wait this long first (ms). */
  delay?: number;
  /** Fade the row out too (default). Off when the row fades itself (a completed quest's slide). */
  fade?: boolean;
}

/**
 * For one row (`id` is its task): `onLayout` and `style` go on the row's
 * outer view; `leave({ then, delay, fade })` fades it (`duration.fast`) and
 * closes its space after `delay` ms, over `duration.slow`, then runs `then`;
 * `stay()` calls a leave off (the quest was unchecked mid-exit).
 * Folds: `foldAway()` (its task closed), `foldBack()` (open again, or turned
 * around mid-fold) and `appear()` (its task opened: it fades in).
 * `hidden`: mount invisible (a row appearing as its task opens), so not even
 * its first frame shows before it fades in.
 */
export function useRowLeave(id: string, { hidden = false }: { hidden?: boolean } = {}) {
  // The row's full height, measured while it isn't leaving or folded away.
  const natural = useRef(0);
  // How much of it has been taken away (pt), and how faded it is (0–1).
  const shrink = useSharedValue(0);
  const gone = useSharedValue(0);
  // Folds: the room given up at once (pt), and the fade (0 shown – 1 gone).
  const foldRoom = useSharedValue(0);
  const foldFade = useSharedValue(hidden ? 1 : 0);

  // Reused by the list for another task: whole again. Before the frame is drawn (a layout
  // effect), so a row reused for one that appears in a fold doesn't flash first.
  const sameItem = useSameItem(id);
  useLayoutEffect(() => {
    if (sameItem()) return;
    shrink.set(0);
    gone.set(0);
    foldRoom.set(0);
    foldFade.set(0);
  }, [sameItem, shrink, gone, foldRoom, foldFade]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (shrink.get() === 0 && foldRoom.get() === 0) natural.current = e.nativeEvent.layout.height;
    },
    [shrink, foldRoom],
  );

  const leave = useCallback(
    ({ then, delay = 0, fade = true }: Leave = {}) => {
      const after = (anim: number) => (delay ? withDelay(delay, anim) : anim);
      if (fade) gone.set(after(withTiming(1, { duration: duration.fast, easing: easingExit })));
      shrink.set(after(withTiming(natural.current, { duration: duration.slow, easing })));
      // On a timer, not when the animation ends: the store change must happen even if
      // the animation is cut short (the list reusing the row while scrolling).
      if (then) setTimeout(then, delay + duration.slow);
    },
    [shrink, gone],
  );

  const stay = useCallback(() => {
    // Only a row that was leaving has anything to undo (rows mount and recycle often).
    if (shrink.get() === 0 && gone.get() === 0) return;
    shrink.set(withTiming(0, { duration: duration.base, easing }));
    gone.set(withTiming(0, { duration: duration.base, easing }));
  }, [shrink, gone]);

  // Its task closed: no room at once (its cell is 0 tall; the rows below glide up over it),
  // still drawn where it is, fading a little ahead of them.
  const foldAway = useCallback(() => {
    foldRoom.set(natural.current);
    foldFade.set(withTiming(1, { duration: duration.base, easing }));
  }, [foldRoom, foldFade]);

  // Open again (or turned around mid-fold): its room back, fading back in from where it is.
  const foldBack = useCallback(() => {
    if (foldRoom.get() === 0 && foldFade.get() === 0) return;
    foldRoom.set(0);
    foldFade.set(withTiming(0, { duration: duration.slow, easing: easingFold }));
  }, [foldRoom, foldFade]);

  // Its task opened: fades in where it appears, as the rows below glide down off it.
  const appear = useCallback(() => {
    foldFade.set(1);
    foldFade.set(withTiming(0, { duration: duration.slow, easing: easingFold }));
  }, [foldFade]);

  const style = useAnimatedStyle(() => ({
    marginBottom: -(shrink.get() + foldRoom.get()),
    opacity: (1 - gone.get()) * (1 - foldFade.get()),
  }));

  return { onLayout, leave, stay, foldAway, foldBack, appear, style };
}

/**
 * Plays row `id`'s part in a fold (see GlideCell.tsx), with the fold
 * controls of its useRowLeave: `away` while a task above it is closing (it
 * gives up its room and fades where it is), `opening` while one is opening.
 * A row that first shows while its task opens fades in; one that's already
 * on screen when a fold turns around goes back from where it is.
 */
export function useRowFold(id: string, away: boolean, opening: boolean, fold: Pick<ReturnType<typeof useRowLeave>, 'foldAway' | 'foldBack' | 'appear'>) {
  const { foldAway, foldBack, appear } = fold;
  // The task this row last showed: a different one means it has just appeared (mounted or reused).
  const shown = useRef<string | null>(null);
  // Before the frame is drawn, so an appearing row starts invisible.
  useLayoutEffect(() => {
    const fresh = shown.current !== id;
    shown.current = id;
    if (away) foldAway();
    else if (opening && fresh) appear();
    else foldBack();
  }, [id, away, opening, foldAway, foldBack, appear]);
}
