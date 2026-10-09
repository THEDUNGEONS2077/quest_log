/**
 * components/common/motion.tsx: Reduce Motion, honored everywhere
 * (PLAN §8.3, §13), and the motion helpers shared by several components.
 *
 * Layer: UI. The "Reduce motion" setting is 'system' (follow Android's
 * "Remove animations"), 'on' or 'off'.
 *   - <MotionConfig/> applies it to every Reanimated animation at once:
 *     with motion reduced, `withTiming`, `withSequence` and friends jump
 *     straight to their end value, so each animation needs no special case.
 *   - useReduceMotion() is for the few things that aren't one animation,
 *     such as the boot sequence (skipped) and the block cursor (steady).
 *   - useSameItem() keeps list-row animations honest when FlashList reuses
 *     a row for another item; useFloatUp() is the one "+N XP" motion.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  ReducedMotionConfig,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAppStore } from '@/store/react';
import { duration, easing, timing } from '@/theme';

/** True when animations should be skipped (the setting, or the OS when it's 'system'). */
export function useReduceMotion(): boolean {
  const setting = useAppStore((s) => s.settings.reduceMotion);
  const system = useReducedMotion();
  return setting === 'system' ? system : setting === 'on';
}

/** Applies the Reduce Motion setting to all Reanimated animations. Mount once, near the root. */
export function MotionConfig() {
  const setting = useAppStore((s) => s.settings.reduceMotion);
  const mode = setting === 'system' ? ReduceMotion.System : setting === 'on' ? ReduceMotion.Always : ReduceMotion.Never;
  return <ReducedMotionConfig mode={mode} />;
}

/**
 * For animations inside list rows. FlashList reuses a row for another item
 * as you scroll, and the new item's state then arrives as a "change" that
 * nobody made. Returns `same()`: call it once in the effect that reacts to a
 * change. True when the row still shows the item it showed last time
 * (animate the change); false when it now shows another one (jump to the
 * new state). Used by the caret, the strikethrough and the quest meter.
 */
export function useSameItem(id: string): () => boolean {
  const last = useRef(id);
  return useCallback(() => {
    const same = last.current === id;
    last.current = id;
    return same;
  }, [id]);
}

/**
 * The floating "+N XP" motion, shared by the XP bar and the completed row:
 * fades in (fast), holds (timing.floatHold), fades out (slow), rising `rise`
 * pt the whole time. Plays each time `play` changes to a new truthy value.
 * Returns the label's animated style.
 */
export function useFloatUp(play: string | number, rise: number) {
  const progress = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!play) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: duration.fast + timing.floatHold + duration.slow, easing }));
    shown.set(
      withSequence(
        withTiming(1, { duration: duration.fast, easing }),
        withDelay(timing.floatHold, withTiming(0, { duration: duration.slow, easing })),
      ),
    );
  }, [play, progress, shown]);
  return useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: -rise * progress.get() }] }));
}
