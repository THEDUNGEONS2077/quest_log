/**
 * app/whats-new.tsx: the "What's new" screen (PLAN §9.19).
 *
 *   > what's new                     ✕
 *   v0.10.0 · BUILD 16
 *   Polish.
 *   - **Boot screen** on launch …
 *   [ CONTINUE ]
 *
 * Layer: UI (Expo Router screen). Shown once after an update (the main
 * screen opens it; see useWhatsNew in app/index.tsx), listing what changed
 * since the build the user last saw. Also reachable from the help screen,
 * where it lists every bundled version. The text comes from CHANGELOG.md,
 * bundled as assets/changelog.json (scripts/gen-changelog.mjs).
 *
 * Route params: `since` = the last build seen ("none" when unknown). No
 * param: show every bundled version.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import changelog from '@/assets/changelog.json';
import { type ChangelogEntry, entriesSince } from '@/lib/changelog';
import { appBuild } from '@/services/appInfo';
import { colors, fonts, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** Which versions to list for the route's `since` param. */
function entriesFor(since: string | undefined): ChangelogEntry[] {
  const all = changelog as ChangelogEntry[];
  if (since === undefined) return all;
  const shown = entriesSince(all, since === 'none' ? null : Number(since), appBuild());
  // Nothing matched (a build without a changelog section): fall back to the newest.
  return shown.length ? shown : all.slice(0, 1);
}

export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();
  const { since } = useLocalSearchParams<{ since?: string }>();
  const entries = entriesFor(since);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header: same shape as the help screen. */}
      <View style={styles.header}>
        <Text style={[type.display, styles.accent]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${glyphs.prompt.glyph} what's new`}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close what's new"
        >
          <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.delete.glyph}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        {entries.map((entry) => (
          <View key={entry.version} style={styles.entry}>
            <Text style={[type.group, styles.accent]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`v${entry.version} · BUILD ${entry.build}`}
            </Text>
            {entry.lines.map((line, i) => (
              <ChangelogLine key={i} line={line} />
            ))}
          </View>
        ))}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            [ CONTINUE ]
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** One Markdown line: a paragraph, or a `- ` bullet (indented by its nesting). */
function ChangelogLine({ line }: { line: string }) {
  const bullet = /^(\s*)- (.*)$/.exec(line);
  if (!bullet) {
    return (
      <Text style={[type.subtask, styles.bright, styles.paragraph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        <Inline text={line.trim()} />
      </Text>
    );
  }
  // Two spaces of Markdown indent = one level.
  const level = Math.floor(bullet[1]!.length / 2);
  return (
    <View style={[styles.bulletRow, { paddingLeft: level * size.indent }]}>
      <Text style={[type.notes, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {level ? '·' : '-'}
      </Text>
      <Text style={[type.notes, styles.text, styles.bulletText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        <Inline text={bullet[2]!} />
      </Text>
    </View>
  );
}

/** Inline Markdown: `**bold**` as bright bold, `` `code` `` in accent, the rest as is. */
function Inline({ text }: { text: string }) {
  // Split keeps the delimited parts (odd indices) thanks to the capture group.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <Text key={i} style={styles.strong}>
            {p.slice(2, -2)}
          </Text>
        ) : p.startsWith('`') ? (
          <Text key={i} style={styles.accent}>
            {p.slice(1, -1)}
          </Text>
        ) : (
          p
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
  },
  close: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  pressed: { backgroundColor: colors.surface },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  entry: { paddingVertical: space.lg, borderBottomWidth: shape.hairline, borderBottomColor: colors.line, gap: space.xs },
  paragraph: { marginBottom: space.sm },
  bulletRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  bulletText: { flex: 1 },
  continue: {
    marginTop: space.xl,
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.accent,
    borderRadius: shape.radius,
  },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  strong: { color: colors.textBright, fontFamily: fonts.bold },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
