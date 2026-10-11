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
 */
import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useSameItem } from '@/components/common/motion';
import { duration, easing, easingExit } from '@/theme';

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
 */
export function useRowLeave(id: string) {
  // The row's full height, measured while it isn't leaving.
  const natural = useRef(0);
  // How much of it has been taken away (pt), and how faded it is (0–1).
  const shrink = useSharedValue(0);
  const gone = useSharedValue(0);

  // Reused by the list for another task: whole again.
  const sameItem = useSameItem(id);
  useEffect(() => {
    if (sameItem()) return;
    shrink.set(0);
    gone.set(0);
  }, [sameItem, shrink, gone]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (shrink.get() === 0) natural.current = e.nativeEvent.layout.height;
    },
    [shrink],
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

  const style = useAnimatedStyle(() => ({ marginBottom: -shrink.get(), opacity: 1 - gone.get() }));

  return { onLayout, leave, stay, style };
}
