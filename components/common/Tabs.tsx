/**
 * components/common/Tabs.tsx: the ACTIVE / COMPLETED segmented control
 * (PLAN §9.1).
 *
 *   [ ACTIVE QUESTS · 12 ][ COMPLETED QUESTS · 34 ]
 *
 * Layer: UI. As in the PLAN §12 wireframes, the selected tab shows its
 * full name ("COMPLETED QUESTS") and the other a short one ("ACTIVE"), so
 * both fit on a phone at the larger text size. Switching is by tap only;
 * a horizontal pager would fight the row swipes. When the COMPLETED count
 * goes up, its number pulses brighter (PLAN §10.4) so you can see where
 * the task went.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { Tab } from '@/store/uiState';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { useMinute } from './useMinute';

export function Tabs() {
  const selectors = useSelectors();
  const now = useMinute();
  const counts = useAppStore((s) => selectors.counts(s, now));
  const tab = useAppStore((s) => s.ui.tab);

  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      <TabButton tab="active" short="ACTIVE" label="ACTIVE QUESTS" count={counts.active} selected={tab === 'active'} />
      <TabButton tab="completed" short="COMPLETED" label="COMPLETED QUESTS" count={counts.completed} selected={tab === 'completed'} />
    </View>
  );
}

interface TabProps {
  tab: Tab;
  /** Shown when not selected. */
  short: string;
  /** Shown when selected. */
  label: string;
  count: number;
  selected: boolean;
}

function TabButton({ tab, short, label, count, selected }: TabProps) {
  const actions = useActions();
  // Pulse when the count increases (a task just arrived on this tab).
  const pulse = useSharedValue(0);
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      pulse.value = withSequence(withTiming(1, { duration: duration.fast, easing }), withTiming(0, { duration: duration.slow, easing }));
    }
    previous.current = count;
  }, [count, pulse]);

  const base = selected ? colors.textBright : colors.textDim;
  const countStyle = useAnimatedStyle(() => ({ color: interpolateColor(pulse.value, [0, 1], [base, colors.accent]) }));

  return (
    <Pressable
      style={[styles.tab, selected ? styles.selected : styles.unselected]}
      onPress={() => actions.setTab(tab)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <Animated.Text style={[type.tab, styles.text, { color: base }]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${selected ? label : short} · `}
        <Animated.Text style={countStyle}>{count}</Animated.Text>
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.sm, gap: space.sm },
  tab: {
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  // The selected tab gets more width for its longer label.
  selected: { flex: 3, borderColor: colors.accent, backgroundColor: colors.surface },
  unselected: { flex: 2 },
  text: { ...platformText },
});
