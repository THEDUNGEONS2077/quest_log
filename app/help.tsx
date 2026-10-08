/**
 * app/help.tsx: the user guide (PLAN §9.17 "Help"), opened from the `?`
 * button at the top right of the header.
 *
 * Layer: UI (Expo Router screen). Static content in the app's terminal
 * style: short sections, each a heading plus `key → what it does` lines,
 * so it can be scanned rather than read. The version and build number
 * are at the bottom, so bug reports are precise (PLAN §2).
 *
 * Keep this in step with features: each phase that adds a gesture,
 * button or shorthand adds its line here.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** One guide line: what you do → what happens. */
interface Line {
  key: string;
  what: string;
}

const g = glyphs;

/** The guide's sections, in the order people need them. */
const SECTIONS: { title: string; lines: Line[] }[] = [
  {
    title: 'ADDING',
    lines: [
      { key: `${g.prompt.glyph} new task`, what: 'Type in the bar at the bottom, press Enter' },
      { key: 'Paste lines', what: 'One task per line. Indent with spaces to nest; "- [x]" adds it checked' },
      { key: '#Groceries', what: 'Creates a group; next tasks go inside it (✕ on the chip to stop)' },
    ],
  },
  {
    title: 'SHORTHAND',
    lines: [
      { key: '! !! !!!', what: 'Priority low / medium / high' },
      { key: '@today @tomorrow', what: 'Due that day at 09:00' },
      { key: '@fri  @mon 9am', what: 'Due next Friday / Monday 09:00' },
      { key: '@5pm  @17:30', what: 'Due at that time (tomorrow if it has passed)' },
      { key: '@in 2h  @in 3d', what: 'Due in 2 hours / 3 days' },
      { key: '// text', what: 'Everything after // becomes notes' },
      { key: '\\word', what: 'Keep a word as typed (\\!!! stays "!!!")' },
    ],
  },
  {
    title: 'EDITING',
    lines: [
      { key: 'Tap a title', what: 'Edit it in place' },
      { key: 'Done / ✓ / back', what: 'Save and close the keyboard' },
      { key: 'Backspace on empty', what: 'Delete the task' },
      { key: `${g.outdent.glyph} OUT  ${g.indent.glyph} IN`, what: 'Move out a level / nest under the task above' },
      { key: `${g.add.glyph} SUB`, what: 'Add a subtask and type it' },
      { key: `${g.priority.glyph} PRI`, what: 'Cycle priority' },
      { key: `${g.notes.glyph} NOTE`, what: 'Write notes under the title' },
      { key: `${g.notify.glyph} DUE`, what: 'Set a due date and reminder' },
      { key: `${g.undo.glyph} UNDO`, what: 'Undo the last change' },
    ],
  },
  {
    title: 'TASKS',
    lines: [
      { key: g.checkboxOff.glyph, what: 'Complete. A group completes when its last task does' },
      { key: 'Swipe right', what: 'Complete (Restore on COMPLETED)' },
      { key: 'Swipe left', what: 'Delete (to Trash)' },
      { key: 'Long-press', what: 'Menu: priority, subtask, indent, notes, duplicate, copy, delete' },
      { key: `${g.expanded.glyph} ${g.collapsed.glyph}`, what: 'Collapse / expand. Long-press: all at that level' },
      { key: `${g.add.glyph} on a group`, what: 'Add a subtask to that group' },
      { key: 'TalkBack', what: 'Every action above is in the row’s actions menu (swipe up/down)' },
      { key: g.notes.glyph, what: 'Show the task’s notes' },
      { key: 'UNDO', what: 'In the message after any complete or delete (5 s)' },
    ],
  },
  {
    title: 'REMINDERS',
    lines: [
      { key: `${g.notify.glyph} DUE / menu`, what: 'Presets (in 1h, tonight, tomorrow, next Mon) or a custom date' },
      { key: 'NOTIFY', what: 'On: a notification at the due time. Off: just the date' },
      { key: 'DONE', what: 'On the notification: completes the task, even with the app closed' },
      { key: 'SNOOZE 15M', what: 'On the notification: remind again in 15 minutes' },
      { key: 'Tap it', what: 'Opens the app at that task' },
      { key: 'OVERDUE', what: 'Shown on open tasks past their due time' },
    ],
  },
  {
    title: 'COMPLETED QUESTS',
    lines: [
      { key: 'Order', what: 'Most recently changed first' },
      { key: 'Long-press', what: 'Restore · Run again (fresh copy) · Delete' },
      { key: 'CLEAR…', what: 'Move old completed tasks to Trash' },
    ],
  },
];

/** "v0.5.1 (build 7)". */
function versionLabel(): string {
  const extra = Constants.expoConfig?.extra ?? {};
  return `v${String(extra.versionName)} (build ${String(extra.versionCode)})`;
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header: same shape as the main screen, with a close button where `?` was. */}
      <View style={styles.header}>
        <Text style={[type.display, styles.title]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${g.prompt.glyph} help`}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close guide"
        >
          <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {g.delete.glyph}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[type.tab, styles.heading]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`${g.prompt.glyph} ${section.title}`}
            </Text>
            {section.lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <Text style={[type.body, styles.key]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {line.key}
                </Text>
                <Text style={[type.meta, styles.what]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {line.what}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={[type.meta, styles.version]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`quest_log ${versionLabel()} · offline, no accounts, no tracking`}
        </Text>
      </ScrollView>
    </View>
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
  title: { color: colors.accent, ...platformText },
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
  accent: { color: colors.accent, ...platformText },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  section: { marginTop: space.xl },
  heading: { color: colors.textBright, marginBottom: space.sm, ...platformText },
  // Each line: the key in body text, the explanation underneath in meta (stacks cleanly at large text sizes).
  line: { paddingVertical: space.sm, borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  key: { color: colors.accent, ...platformText },
  what: { color: colors.text, marginTop: space.xs, ...platformText },
  version: { color: colors.textDim, marginTop: space.xl, ...platformText },
});
