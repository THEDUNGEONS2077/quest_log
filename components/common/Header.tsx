/**
 * components/common/Header.tsx: the terminal header (PLAN §9.1).
 *
 *   > quest_log_
 *   12 ACTIVE · 4 DONE TODAY · 1 OVERDUE
 *
 * Layer: UI. Search and settings controls arrive with their features
 * (Phases 10 and 13). Long-pressing the title opens the developer screen
 * (theme check and test data), a deliberately hidden gesture.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore, useSelectors } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

import { useMinute } from './useMinute';

export function Header() {
  const selectors = useSelectors();
  const now = useMinute();
  // Counts are memoized per structural change and per minute (store/selectors.ts).
  const counts = useAppStore((s) => selectors.counts(s, now));

  const meta = [`${counts.active} ACTIVE`, `${counts.doneToday} DONE TODAY`, ...(counts.overdue ? [`${counts.overdue} OVERDUE`] : [])].join(' · ');

  return (
    <View style={styles.header}>
      <Pressable onLongPress={() => router.push('/dev')} delayLongPress={1500} accessibilityRole="header">
        <Text style={[type.display, styles.title]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${glyphs.prompt.glyph} quest_log_`}
        </Text>
      </Pressable>
      <Text style={[type.meta, styles.meta]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {meta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  title: { color: colors.accent, ...platformText },
  meta: { color: colors.textDim, marginTop: space.xs, ...platformText },
});
