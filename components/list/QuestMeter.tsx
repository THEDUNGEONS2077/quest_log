/**
 * components/list/QuestMeter.tsx: a quest's progress, with the XP it will
 * earn (user request 2026-10-09). Replaces the plain `[1/3]` count.
 *
 *   [▓▓▓▓▓░░░░ 1/3 · +34 XP]
 *
 * Layer: UI. A small framed meter whose background fills (a faint accent
 * wash) as subtasks are checked; the count and the XP preview sit on top.
 * The preview is what completing the quest earns before streak multipliers
 * (lib/xp.ts previewXp: base, priority, +8 per subtask, on-time bonus), so
 * a bigger quest visibly promises more. The fill eases to each new value
 * (instant with Reduce Motion, and when the list reuses the row for another
 * quest).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSameItem } from '@/components/common/motion';
import { useMinuteIf } from '@/components/common/useMinute';
import type { Task } from '@/lib/types';
import { baseXp } from '@/lib/xp';
import { useAppStore, useSelectors } from '@/store/react';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape, space, type } from '@/theme';

interface Props {
  task: Task;
  done: number;
  total: number;
}

/** The meter for a task with subtasks. */
export function QuestMeter({ task, done, total }: Props) {
  const selectors = useSelectors();
  // All subtasks at any depth count toward the quest bonus (cached per structure change).
  const subtasks = useAppStore((s) => selectors.subtaskCount(s, task.id));
  // Only a dated quest needs the clock (the on-time bonus ends when it's due).
  const now = useMinuteIf(task.dueAt !== null);
  const xp = baseXp(task, subtasks, now);
  const fraction = total > 0 ? done / total : 0;

  const fill = useSharedValue(fraction);
  // The same quest: ease to the new value. A row reused for another quest while
  // scrolling: jump (it would otherwise fill or drain on its own).
  const sameItem = useSameItem(task.id);
  useEffect(() => {
    fill.set(sameItem() ? withTiming(fraction, { duration: duration.slow, easing }) : fraction);
  }, [fraction, fill, sameItem]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));

  return (
    <View style={styles.meter} accessible accessibilityLabel={`${done} of ${total} subtasks done. Completing it earns ${xp} XP`}>
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text style={[type.meta, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${done}/${total}`}
        <Text style={styles.xp}>{` · +${xp} XP`}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    paddingHorizontal: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.xpWash },
  text: { color: colors.textDim, ...platformText },
  xp: { color: colors.text },
});
