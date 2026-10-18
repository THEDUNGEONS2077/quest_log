/**
 * components/common/Tabs.tsx: the quest tabs and the ACTIVE / COMPLETED
 * switch (user request 2026-10-09; was ACTIVE / COMPLETED, PLAN §9.1).
 *
 *   [ ALL 12 ][ DAILY 3 ][ MAIN 7 ][ MISC 2 ]  quest tabs: open quests under each
 *   [ ACTIVE · 12      ][ COMPLETED · 34 ]     the switch, for the selected tab
 *
 * Layer: UI. The quest tab picks which quests are listed (lib/quests.ts);
 * the switch below it picks open or completed ones, for every tab (so the
 * panel never changes height between tabs). Both are remembered across
 * launches. Switching is by tap only: a horizontal pager would fight the
 * row swipes. Tapping the selected tab again goes to the top of its view
 * (out of a zoom first), the usual mobile convention. When the COMPLETED count goes up, its number pulses brighter
 * (PLAN §10.4), so you see where a finished quest went.
 *
 * Instant (responsiveness pass 2026-10-18: "a delay with how long it takes to
 * switch the tabs"): a tapped tab lights up at once, on its own, light render;
 * the switch itself (a fresh list for the new tab, the heavy part) follows
 * once that frame is drawn. A tab tapped while another is still on its way
 * wins; the one passed over is never built.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { CATEGORIES, type CategoryTab } from '@/lib/quests';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import type { Tab } from '@/store/uiState';
import { colors, duration, easing, fonts, glowShadow, glowTextSoft, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** The quest tabs in order: ALL, then each category. */
const QUEST_TABS: readonly { key: CategoryTab; label: string; a11y: string }[] = [
  { key: 'all', label: 'ALL', a11y: 'All quests' },
  ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, a11y: `${c.label.toLowerCase()} quests` })),
];

// Memoized: it reads the store itself, so the main screen re-rendering (editing, selecting,
// searching starting or ending) needn't re-render it (responsiveness pass 2026-10-18).
export const Tabs = memo(function Tabs() {
  const selectors = useSelectors();
  const counts = useAppStore((s) => selectors.tabCounts(s));
  const category = useAppStore((s) => s.ui.category);
  const tab = useAppStore((s) => s.ui.tab);
  const actions = useActions();
  // What was just tapped (a quest tab, a switch side), lit before the store and the list catch
  // up. Each is forgotten once the store shows it (the previous-props pattern).
  const [pending, setPending] = useState<Pending>({});
  const caughtUp = (pending.category === undefined || pending.category === category) && (pending.tab === undefined || pending.tab === tab);
  if ((pending.category !== undefined || pending.tab !== undefined) && caughtUp) setPending({});
  const shownCategory = pending.category ?? category;
  const shownTab = pending.tab ?? tab;
  // The latest tap of each kind: one overtaken by another of its kind isn't applied at all.
  const latest = useRef({ category: 0, tab: 0 });
  /** Lights `value` now; runs `apply` once that frame is drawn (unless another tap of its kind came first). */
  const switchTo = <K extends keyof Pending>(kind: K, value: Pending[K], apply: () => void) => {
    setPending((p) => ({ ...p, [kind]: value }));
    const turn = ++latest.current[kind];
    afterPaint(() => {
      if (turn === latest.current[kind]) apply();
    });
  };

  return (
    <View style={styles.wrap}>
      {/* Quest tabs. */}
      <View style={styles.row} accessibilityRole="tablist">
        {QUEST_TABS.map((q) => {
          // Lit as soon as it's tapped; "tapped again" means the tab really shown.
          const selected = shownCategory === q.key;
          return (
            <Pressable
              key={q.key}
              // Tapping the selected tab again goes to the top of it (out of a zoom, or scroll up).
              onPress={() =>
                category === q.key && pending.category === undefined
                  ? actions.toTabTop()
                  : switchTo('category', q.key, () => actions.setCategoryTab(q.key))
              }
              style={[styles.quest, selected && styles.questOn]}
              // Half as tall as before, still 44 pt to tap.
              hitSlop={{ top: QUEST_SLOP, bottom: QUEST_SLOP }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              // The web build reads only aria-selected (react-native-web 0.21 ignores accessibilityState).
              aria-selected={selected}
              accessibilityLabel={`${q.a11y}, ${counts[q.key].active} open`}
            >
              {/* One line: the label, then its open count (half-height tabs, user request 2026-10-17). */}
              <Text
                style={[type.tab, styles.questLabel, selected ? styles.bright : styles.dim]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              >
                {q.label}
                <Text style={[styles.questCount, selected ? styles.accent : styles.dim]}>{` ${counts[q.key].active}`}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ACTIVE / COMPLETED for the selected quest tab. */}
      <View style={styles.row} accessibilityRole="tablist">
        <ViewSwitch
          label="ACTIVE"
          count={counts[shownCategory].active}
          selected={shownTab === 'active'}
          onPress={() => (tab === 'active' && pending.tab === undefined ? actions.toTabTop() : switchTo('tab', 'active', () => actions.setTab('active')))}
        />
        <ViewSwitch
          label="COMPLETED"
          count={counts[shownCategory].completed}
          selected={shownTab === 'completed'}
          onPress={() =>
            tab === 'completed' && pending.tab === undefined ? actions.toTabTop() : switchTo('tab', 'completed', () => actions.setTab('completed'))
          }
        />
      </View>
    </View>
  );
});

/** A tap the store hasn't applied yet: a quest tab, an ACTIVE / COMPLETED side. */
interface Pending {
  category?: CategoryTab;
  tab?: Tab;
}

/**
 * Runs `fn` after the next frame has been drawn: the light render that lit a tab
 * reaches the screen before the heavy one (a fresh list) starts.
 */
function afterPaint(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

interface SwitchProps {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}

/** One half of the ACTIVE / COMPLETED switch; its count pulses when it goes up. */
function ViewSwitch({ label, count, selected, onPress }: SwitchProps) {
  const pulse = useSharedValue(0);
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      pulse.set(withSequence(withTiming(1, { duration: duration.fast, easing }), withTiming(0, { duration: duration.slow, easing })));
    }
    previous.current = count;
  }, [count, pulse]);

  const base = selected ? colors.accent : colors.textDim;
  const countStyle = useAnimatedStyle(() => ({ color: interpolateColor(pulse.get(), [0, 1], [base, colors.textBright]) }));

  return (
    <Pressable
      onPress={onPress}
      // A slim switch, but still 44 pt to tap.
      hitSlop={{ top: SWITCH_SLOP, bottom: SWITCH_SLOP }}
      style={styles.switch}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={`${label.toLowerCase()}, ${count}`}
    >
      <Animated.Text
        style={[type.meta, styles.switchText, { color: base }]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {`${label} · `}
        <Animated.Text style={countStyle}>{count}</Animated.Text>
      </Animated.Text>
      {/* The bar under it: its own view, so the selected one can glow without lighting the whole half. */}
      <View style={[styles.bar, selected && styles.barOn]} />
    </Pressable>
  );
}

/** A quest tab's drawn height: half the old 52 pt (user request 2026-10-17). */
const QUEST_HEIGHT = 26;
/** Extra touch area above and below, so a quest tab is still 44 pt to tap. */
const QUEST_SLOP = Math.ceil((size.hitTarget - QUEST_HEIGHT) / 2);

/** The ACTIVE / COMPLETED switch, drawn height: 28 → 25 pt (2026-10-09), then 10% smaller again: 22.5 pt (user request 2026-10-11). */
const SWITCH_HEIGHT = 22.5;
/** Extra touch area above and below, so it's still 44 pt to tap. */
const SWITCH_SLOP = Math.ceil((size.hitTarget - SWITCH_HEIGHT) / 2);

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.lg, marginBottom: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.xs + 2 },
  // Quest tabs: equal widths; label over its open-quest count.
  // Half the old height (52 → 26 pt, user request 2026-10-17: a shorter top panel).
  quest: {
    flex: 1,
    minHeight: QUEST_HEIGHT,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  // Selected: accent frame on surface, with the faint glow (user request 2026-10-11: subtle accents).
  questOn: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: glowShadow.faint },
  // The label a step smaller to sit on one line with its count (the tab role was 14/20).
  questLabel: { fontSize: 12, lineHeight: 16 },
  // The count in the regular weight, after the bold label, so the two read apart.
  questCount: { fontFamily: fonts.medium, letterSpacing: 0 },
  // The switch: slimmer and unfilled, so it reads as secondary to the quest tabs.
  switch: { flex: 1, minHeight: SWITCH_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  // A 2 pt bar along its bottom: `line`, or accent with the glow when selected.
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: shape.dropIndicator, backgroundColor: colors.line },
  barOn: { backgroundColor: colors.accent, boxShadow: glowShadow.outset },
  // The meta role made smaller twice by 10% (user requests 2026-10-09, 2026-10-11): 13/18 → 12/16 → 10.8/14.4.
  switchText: { fontSize: 10.8, lineHeight: 14.4, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  // The selected tab's count glows softly.
  accent: { color: colors.accent, ...glowTextSoft, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
