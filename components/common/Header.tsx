/**
 * components/common/Header.tsx: the terminal header (PLAN §9.1).
 *
 *   <7>_quest_log                       [/] [⊛]
 *
 * Layer: UI. Top right: `/` opens search on the current tab, ⊛ opens
 * Settings (app/settings.tsx), where HELP opens the user guide. A shorter
 * top panel (user request 2026-10-17): the status line (ACTIVE · DONE
 * TODAY · streak) and the `?` button are gone.
 * Tapping the title goes home: ALL quests, ACTIVE, top level, scrolled up
 * (second navigation pass, 2026-10-09). Long-pressing it opens the developer screen
 * (theme check and test data), a deliberately hidden gesture.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { levelInfo } from '@/lib/xp';
import { useActions, useAppStore } from '@/store/react';
import { colors, glowShadow, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';


export function Header() {
  const tab = useAppStore((s) => s.ui.tab);
  const actions = useActions();
  // XP (lib/xp.ts): the level in the title.
  const level = useAppStore((s) => levelInfo(s.tasks.progress.xp).level);

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {/* The title gives way first at large text sizes, so the buttons always fit. */}
        {/* `<7>_quest_log`: the level in brackets, 30% larger than before (user request 2026-10-09).
            It shrinks to fit rather than pushing the buttons off-screen. */}
        <Pressable
          // Tap: home (ALL quests, ACTIVE, top level, scrolled up), from anywhere on this screen.
          onPress={actions.goHome}
          onLongPress={() => router.push('/dev')}
          delayLongPress={1500}
          accessibilityRole="header"
          accessibilityLabel={`quest_log, level ${level}`}
          accessibilityHint="Goes to all active quests, at the top"
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
        {/* Top right: search (this tab) and settings (the user guide is in there). */}
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
    </View>
  );
}

/** The drawn size of the / and ⊛ boxes; hitSlop brings the touch area to 44 pt. */
const ICON_BOX = 34;
const ICON_SLOP = (size.hitTarget - ICON_BOX) / 2;

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  icons: { flexDirection: 'row', gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBox: { flexShrink: 1, marginRight: space.sm },
  // The name glows softly: the app's one effect, on its one name.
  title: { color: colors.accent, ...glowTextSoft, ...platformText },
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
  // Pressed: the frame lights up (lineLit) with the faint glow (aesthetic pass 2026-10-17).
  pressed: { backgroundColor: colors.surface, borderColor: colors.lineLit, boxShadow: glowShadow.faint },
  icon: { color: colors.accent, ...platformText },
});
