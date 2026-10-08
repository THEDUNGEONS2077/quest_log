/**
 * components/common/motion.tsx: Reduce Motion, honored everywhere
 * (PLAN §8.3, §13).
 *
 * Layer: UI. The "Reduce motion" setting is 'system' (follow Android's
 * "Remove animations"), 'on' or 'off'.
 *   - <MotionConfig/> applies it to every Reanimated animation at once:
 *     with motion reduced, `withTiming`, `withSequence` and friends jump
 *     straight to their end value, so each animation needs no special case.
 *   - useReduceMotion() is for the few things that aren't one animation,
 *     such as the boot sequence (skipped) and the block cursor (steady).
 */
import { ReducedMotionConfig, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

import { useAppStore } from '@/store/react';

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
