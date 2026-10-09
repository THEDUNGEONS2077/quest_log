/**
 * components/common/Header.tsx: the terminal header (PLAN §9.1).
 *
 *   > quest_log
 *   12 ACTIVE · 4 DONE TODAY · 1 OVERDUE
 *
 * Layer: UI. Top right: `/` opens search on the current tab, `?` opens the
 * user guide (app/help.tsx), ⊛ opens Settings (app/settings.tsx).
 * Long-pressing the title opens the developer screen (theme check and test
 * data), a deliberately hidden gesture.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentDayStreak, levelInfo } from '@/lib/xp';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { useMinute } from './useMinute';

export function Header() {
  const selectors = useSelectors();
  const now = useMinute();
  // Counts are memoized per structural change and per minute (store/selectors.ts).
  const counts = useAppStore((s) => selectors.counts(s, now));
  const tab = useAppStore((s) => s.ui.tab);
  const actions = useActions();
  // XP (lib/xp.ts): the level in the title, the day streak in the status line.
  const progress = useAppStore((s) => s.tasks.progress);
  const level = levelInfo(progress.xp).level;
  const streak = currentDayStreak(progress, now);

  const meta = [
    `${counts.active} ACTIVE`,
    `${counts.doneToday} DONE TODAY`,
    ...(counts.overdue ? [`${counts.overdue} OVERDUE`] : []),
    ...(streak >= 2 ? [`${streak}-DAY STREAK`] : []),
  ].join(' · ');

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {/* The title gives way first at large text sizes, so the buttons always fit. */}
        {/* `<7>_quest_log`: the level in brackets, 30% larger than before (user request 2026-10-09).
            It shrinks to fit rather than pushing the buttons off-screen. */}
        <Pressable
          onLongPress={() => router.push('/dev')}
          delayLongPress={1500}
          accessibilityRole="header"
          accessibilityLabel={`quest_log, level ${level}`}
          style={styles.titleBox}
        >
          <Text
            style={[type.title, styles.title]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            <Text style={styles.bracket}>{'<'}</Text>
            <Text style={styles.level}>{level}</Text>
            <Text style={styles.bracket}>{'>'}</Text>
            _quest_log
          </Text>
        </Pressable>
        {/* Top right: search (this tab), the user guide and settings. */}
        <View style={styles.icons}>
          <Pressable
            onPress={() => actions.setSearch(tab, { open: true })}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            hitSlop={ICON_SLOP}
            accessibilityRole="button"
            accessibilityLabel={tab === 'active' ? 'Search and filter tasks' : 'Search completed tasks'}
          >
            <Text style={[type.glyph, styles.icon]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {glyphs.search.glyph}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/help')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            hitSlop={ICON_SLOP}
            accessibilityRole="button"
            accessibilityLabel="User guide"
          >
            <Text style={[type.glyph, styles.icon]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {glyphs.help.glyph}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            hitSlop={ICON_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={[type.glyph, styles.icon]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {glyphs.settings.glyph}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text style={[type.meta, styles.meta]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {meta}
      </Text>
    </View>
  );
}

/** The drawn size of the / ? ⊛ boxes; hitSlop brings the touch area to 44 pt. */
const ICON_BOX = 34;
const ICON_SLOP = (size.hitTarget - ICON_BOX) / 2;

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  icons: { flexDirection: 'row', gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBox: { flexShrink: 1, marginRight: space.sm },
  title: { color: colors.accent, ...platformText },
  bracket: { color: colors.textDim },
  level: { color: colors.textBright },
  // Smaller boxes (user request 2026-10-09): 34 pt drawn, still 44 pt to tap (hitSlop).
  iconButton: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  pressed: { backgroundColor: colors.surface },
  icon: { color: colors.accent, ...platformText },
  meta: { color: colors.textDim, marginTop: space.xs, ...platformText },
});
