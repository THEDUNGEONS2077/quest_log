/**
 * components/common/Tabs.tsx: the quest tabs and the ACTIVE / COMPLETED
 * switch (user request 2026-10-09; was ACTIVE / COMPLETED, PLAN §9.1).
 *
 *   [  ALL  ][ DAILY ][ MAIN  ][ MISC  ]     quest tabs: open quests under each
 *      12       3        7        2
 *   [ ACTIVE · 12      ][ COMPLETED · 34 ]  the switch, for the selected tab
 *
 * Layer: UI. The quest tab picks which quests are listed (lib/quests.ts);
 * the switch below it picks open or completed ones, for every tab (so the
 * panel never changes height between tabs). Both are remembered across
 * launches. Switching is by tap only: a horizontal pager would fight the
 * row swipes. When the COMPLETED count goes up, its number pulses brighter
 * (PLAN §10.4), so you see where a finished quest went.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { CATEGORIES, type CategoryTab } from '@/lib/quests';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import type { Tab } from '@/store/uiState';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** The quest tabs in order: ALL, then each category. */
const QUEST_TABS: readonly { key: CategoryTab; label: string; a11y: string }[] = [
  { key: 'all', label: 'ALL', a11y: 'All quests' },
  ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, a11y: `${c.label.toLowerCase()} quests` })),
];

export function Tabs() {
  const selectors = useSelectors();
  const counts = useAppStore((s) => selectors.tabCounts(s));
  const category = useAppStore((s) => s.ui.category);
  const tab = useAppStore((s) => s.ui.tab);
  const actions = useActions();

  return (
    <View style={styles.wrap}>
      {/* Quest tabs. */}
      <View style={styles.row} accessibilityRole="tablist">
        {QUEST_TABS.map((q) => {
          const selected = category === q.key;
          return (
            <Pressable
              key={q.key}
              onPress={() => actions.setCategoryTab(q.key)}
              style={[styles.quest, selected && styles.questOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${q.a11y}, ${counts[q.key].active} open`}
            >
              <Text
                style={[type.tab, selected ? styles.bright : styles.dim]}
                numberOfLines={1}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              >
                {q.label}
              </Text>
              <Text style={[type.meta, selected ? styles.accent : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {counts[q.key].active}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ACTIVE / COMPLETED for the selected quest tab. */}
      <View style={styles.row} accessibilityRole="tablist">
        <ViewSwitch tab="active" label="ACTIVE" count={counts[category].active} selected={tab === 'active'} />
        <ViewSwitch tab="completed" label="COMPLETED" count={counts[category].completed} selected={tab === 'completed'} />
      </View>
    </View>
  );
}

interface SwitchProps {
  tab: Tab;
  label: string;
  count: number;
  selected: boolean;
}

/** One half of the ACTIVE / COMPLETED switch; its count pulses when it goes up. */
function ViewSwitch({ tab, label, count, selected }: SwitchProps) {
  const actions = useActions();
  const pulse = useSharedValue(0);
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      pulse.value = withSequence(withTiming(1, { duration: duration.fast, easing }), withTiming(0, { duration: duration.slow, easing }));
    }
    previous.current = count;
  }, [count, pulse]);

  const base = selected ? colors.accent : colors.textDim;
  const countStyle = useAnimatedStyle(() => ({ color: interpolateColor(pulse.value, [0, 1], [base, colors.textBright]) }));

  return (
    <Pressable
      onPress={() => actions.setTab(tab)}
      // A slim switch, but still 44 pt to tap.
      hitSlop={{ top: space.sm, bottom: space.sm }}
      style={[styles.switch, selected && styles.switchOn]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label.toLowerCase()}, ${count}`}
    >
      <Animated.Text style={[type.meta, styles.text, { color: base }]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${label} · `}
        <Animated.Text style={countStyle}>{count}</Animated.Text>
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.lg, marginBottom: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.xs + 2 },
  // Quest tabs: equal widths; label over its open-quest count.
  quest: {
    flex: 1,
    minHeight: size.hitTarget + space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  questOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  // The switch: slimmer and unfilled, so it reads as secondary to the quest tabs.
  switch: {
    flex: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: shape.dropIndicator,
    borderBottomColor: colors.line,
  },
  switchOn: { borderBottomColor: colors.accent },
  text: { ...platformText },
  bright: { color: colors.textBright, ...platformText },
  accent: { color: colors.accent, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
