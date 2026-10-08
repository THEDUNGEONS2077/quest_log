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

  const meta = [`${counts.active} ACTIVE`, `${counts.doneToday} DONE TODAY`, ...(counts.overdue ? [`${counts.overdue} OVERDUE`] : [])].join(
    ' · ',
  );

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Pressable onLongPress={() => router.push('/dev')} delayLongPress={1500} accessibilityRole="header">
          <Text style={[type.display, styles.title]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} quest_log`}
          </Text>
        </Pressable>
        {/* Top right: search (this tab), the user guide and settings. */}
        <View style={styles.icons}>
          <Pressable
            onPress={() => actions.setSearch(tab, { open: true })}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  icons: { flexDirection: 'row', gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.accent, ...platformText },
  iconButton: {
    width: size.hitTarget,
    height: size.hitTarget,
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
