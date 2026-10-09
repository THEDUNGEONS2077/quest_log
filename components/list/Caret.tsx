/**
 * components/list/Caret.tsx: the ▸ collapse/expand caret, which rotates
 * (PLAN §10.7).
 *
 * Layer: UI. One ▸ glyph turned 90° when open (pointing down, like ▾),
 * animated over 120 ms. Groups with more than 50 children switch instantly,
 * since their rows appear all at once anyway. With Reduce Motion, every
 * turn is instant (components/common/motion.tsx).
 *
 * List rows are recycled: when this caret starts showing a different task,
 * it jumps straight to that task's state instead of animating.
 */
import { useEffect } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSameItem } from '@/components/common/motion';
import type { ID } from '@/lib/types';
import { duration, easing, glyphs, maxFontSizeMultiplier, type } from '@/theme';

/** Above this many children the caret turns without animating (PLAN §10.7). */
const ANIMATE_MAX_CHILDREN = 50;

interface Props {
  /** The task the caret belongs to (detects row recycling). */
  id: ID;
  open: boolean;
  /** Direct children, to skip the animation for huge groups. */
  childCount: number;
  style?: StyleProp<TextStyle>;
}

/** The rotating caret glyph (wrap it in the row's caret button). */
export function Caret({ id, open, childCount, style }: Props) {
  const turn = useSharedValue(open ? 1 : 0);
  const sameItem = useSameItem(id);
  useEffect(() => {
    const target = open ? 1 : 0;
    // Same task: animate the change. A recycled row (new task): jump.
    const animate = sameItem() && childCount <= ANIMATE_MAX_CHILDREN;
    turn.set(animate ? withTiming(target, { duration: duration.fast, easing }) : target);
  }, [open, childCount, turn, sameItem]);

  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 90}deg` }] }));
  return (
    <Animated.Text style={[type.caretGlyph, style, rotate]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {glyphs.collapsed.glyph}
    </Animated.Text>
  );
}
