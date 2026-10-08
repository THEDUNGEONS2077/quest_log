/**
 * app/help.tsx: the user guide (PLAN §9.17 "Help"), opened from the `?`
 * button at the top right of the header.
 *
 * Layer: UI (Expo Router screen). Rewritten for clarity (user request
 * 2026-10-08): collapsible sections in the app's terminal style. Each
 * section opens with one plain sentence saying what the feature is for,
 * then short "do this → this happens" lines. START HERE is open by
 * default; the rest open with a tap, so the guide never feels like a wall
 * of text. The version and build number are at the bottom, so bug reports
 * are precise (PLAN §2).
 *
 * Keep this in step with features: each phase that adds a gesture,
 * button or shorthand adds its line here.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** One guide line: what you do → what happens. */
interface Line {
  key: string;
  what: string;
}

interface Section {
  title: string;
  /** One plain sentence: what this is for. */
  intro: string;
  lines: Line[];
}

const g = glyphs;

/** The guide, in the order people need it. */
const SECTIONS: Section[] = [
  {
    title: 'START HERE',
    intro: 'quest_log is a to-do list that lives only on your phone: no account, no internet, nothing leaves the device.',
    lines: [
      { key: '1. Add', what: 'Type a task in the bar at the bottom and press Enter.' },
      { key: '2. Finish', what: `Tap the ${g.checkboxOff.glyph} box (or swipe the task right) when it's done.` },
      { key: '3. Change', what: 'Tap any task title to edit it. Press Done on the keyboard to save.' },
      { key: 'Oops?', what: 'Most actions show a message with UNDO for 5 seconds.' },
    ],
  },
  {
    title: 'ADDING TASKS',
    intro: 'New tasks come from the bar at the bottom, from a group, or from pasting a list.',
    lines: [
      {
        key: `${g.prompt.glyph} new task`,
        what: 'The bar at the bottom of ACTIVE QUESTS. Type, press Enter. The keyboard closes after each task.',
      },
      { key: `${g.add.glyph} next to a group`, what: 'Adds a subtask inside that group and opens it for typing.' },
      { key: `${g.add.glyph} SUB`, what: 'While editing a task: adds a subtask under it.' },
      {
        key: 'Paste a list',
        what: 'Paste several lines: one task per line. Indent lines with spaces to make subtasks; "- [x]" adds a line already checked.',
      },
      {
        key: '#Groceries',
        what: 'Starting with # makes a group, and the next tasks you add go inside it. Tap ✕ on the "IN:" chip to stop.',
      },
    ],
  },
  {
    title: 'EDITING A TASK',
    intro: 'Tap a title to edit it. A toolbar appears above the keyboard with everything you can change.',
    lines: [
      { key: 'Done / ✓ / back', what: 'Saves and closes the keyboard. Editing never creates a new task.' },
      { key: 'Backspace when empty', what: 'Deletes the task (never a task that still has subtasks).' },
      { key: `${g.outdent.glyph} OUT`, what: 'Moves the task out one level.' },
      { key: `${g.indent.glyph} IN`, what: 'Nests the task under the one above it.' },
      {
        key: `${g.priority.glyph} PRI`,
        what: `Cycles priority: none ${g.priority.glyph} ${g.priority.glyph.repeat(2)} ${g.priority.glyph.repeat(3)}.`,
      },
      { key: `${g.notes.glyph} NOTE`, what: 'Writes notes under the title (links in notes can be tapped).' },
      { key: `${g.notify.glyph} DUE`, what: 'Sets a due date and reminder.' },
      { key: `${g.undo.glyph} UNDO`, what: 'Undoes your last change.' },
    ],
  },
  {
    title: 'GROUPS & SUBTASKS',
    intro: 'Any task can hold subtasks. A main task with subtasks is a group, with a progress count like [2/5].',
    lines: [
      { key: 'Make a group', what: 'Use IN on a task, the + on a group, + SUB while editing, or paste an indented list.' },
      {
        key: `${g.expanded.glyph} / ${g.collapsed.glyph}`,
        what: 'Tap to hide or show a group’s subtasks. Hold to do it for every group at that level.',
      },
      {
        key: `${g.zoom.glyph} Zoom into`,
        what: 'From the hold menu: shows only that group. The path at the top (← ALL / …) takes you back; so does the back button.',
      },
      { key: 'Sort subtasks…', what: 'From the hold menu: order a group’s subtasks by priority, due date or A–Z, once.' },
    ],
  },
  {
    title: 'MOVING TASKS',
    intro: 'Rearrange by dragging, or send a task straight to another group.',
    lines: [
      {
        key: 'Hold, then drag',
        what: 'Drag up or down to reorder. Drag right to nest under the task above, left to move out a level. A green line shows where it lands.',
      },
      { key: 'Near the edge', what: 'The list scrolls by itself while you drag near the top or bottom.' },
      { key: 'Over a closed group', what: 'Hover for a moment and it opens, so you can drop inside.' },
      { key: `${g.moveTo.glyph} Move to…`, what: 'From the hold menu: pick any group (or TOP LEVEL) from a searchable list.' },
    ],
  },
  {
    title: 'FINISHING & UNDO',
    intro: 'Checking a task off moves it out of the way. Nothing is ever lost by accident.',
    lines: [
      {
        key: g.checkboxOff.glyph,
        what: 'Completes the task. Checking a group completes everything in it; finishing the last subtask completes the group.',
      },
      { key: 'Swipe right', what: 'Completes the task. Swipe left deletes it.' },
      { key: 'COMPLETED QUESTS', what: 'Finished main tasks move to this tab, newest first.' },
      { key: 'Restore', what: `On COMPLETED: swipe right, or tap ${g.checkboxOn.glyph}, to put a task back where it was.` },
      { key: 'Run again', what: 'On COMPLETED, hold a task: a fresh unchecked copy, great for checklists.' },
      { key: 'CLEAR…', what: 'On COMPLETED: moves old completed tasks to Trash.' },
    ],
  },
  {
    title: 'DATES & REMINDERS',
    intro: 'Give a task a due date, and optionally a notification at that time.',
    lines: [
      { key: `${g.notify.glyph} DUE / hold menu`, what: 'Pick IN 1H, TONIGHT, TOMORROW, NEXT MON, or CUSTOM for any date and time.' },
      { key: 'NOTIFY', what: 'On: a notification at the due time. Off: just the date.' },
      { key: 'DONE on the notification', what: 'Completes the task, even with the app closed.' },
      { key: 'SNOOZE 15M', what: 'Reminds you again in 15 minutes.' },
      { key: 'Tap the notification', what: 'Opens the app right at that task.' },
      { key: 'OVERDUE', what: 'Shown on open tasks whose time has passed.' },
    ],
  },
  {
    title: 'REPEATING TASKS',
    intro: 'For things you do regularly. Checking one off moves it to its next date instead of finishing it.',
    lines: [
      {
        key: `${g.repeat.glyph} REPEAT…`,
        what: 'In the date sheet or hold menu: daily, weekdays, weekly (pick days), monthly, yearly, or every N days/weeks/months.',
      },
      {
        key: 'After checking',
        what: 'It springs back with its next date, its subtasks reset, and a done copy is kept on COMPLETED (marked ↻).',
      },
      { key: 'AFTER DONE', what: 'The next date counts from when you finished, not from the schedule.' },
      { key: 'Missed days', what: 'An overdue repeat jumps to the next future date; missed ones don’t pile up.' },
    ],
  },
  {
    title: 'TYPING SHORTCUTS',
    intro: 'Type these anywhere you type a task; chips under the text show what they’ll do.',
    lines: [
      { key: '! !! !!!', what: 'Priority low, medium, high.' },
      { key: '@today @tomorrow', what: 'Due that day at 09:00.' },
      { key: '@fri  @mon 9am', what: 'Due next Friday at 09:00 / Monday at 9.' },
      { key: '@5pm  @17:30', what: 'Due at that time today (tomorrow if it has passed).' },
      { key: '@in 2h  @in 3d', what: 'Due in 2 hours / 3 days.' },
      { key: '*daily *weekdays', what: 'Repeats. Also *weekly *monthly *yearly *mon,thu *every 2w.' },
      { key: '// some text', what: 'Everything after // becomes notes.' },
      { key: '\\word', what: 'Keeps a word exactly as typed (\\!!! stays "!!!").' },
      { key: 'Example', what: 'buy milk !! @fri 5pm *weekly // the oat one' },
    ],
  },
  {
    title: 'SEARCH & FILTERS',
    intro: 'Find tasks fast. Each tab has its own search.',
    lines: [
      { key: `${g.search.glyph} (top right)`, what: 'Searches titles and notes. Capitals and accents don’t matter.' },
      { key: 'Results', what: 'Matches show with the groups they’re in (dimmed), so you know where they live.' },
      { key: 'ALL !!! DUE OVERDUE ↻', what: 'Filters on ACTIVE: high priority, has a date, overdue, repeating.' },
      { key: '✕ or back', what: 'Closes search and shows everything again.' },
    ],
  },
  {
    title: 'SELECTING SEVERAL',
    intro: 'Act on many tasks at once.',
    lines: [
      { key: `${g.select.glyph} Select`, what: 'From the hold menu. Then tap more tasks to add them (a group brings its subtasks).' },
      { key: 'Bottom bar', what: 'DONE · PRI · DUE · MOVE · GROUP (wrap them in a new group) · DEL.' },
      { key: 'CANCEL or back', what: 'Leaves select mode.' },
    ],
  },
  {
    title: 'TRASH',
    intro: 'Deleted tasks wait in Trash for 7 days before they’re gone for good.',
    lines: [
      { key: `${g.delete.glyph} TRASH`, what: 'On the COMPLETED tab. Restore puts a task back where it was, with its subtasks.' },
      { key: 'DELETE NOW / EMPTY', what: 'Removes tasks permanently (asks first).' },
    ],
  },
  {
    title: 'ACCESSIBILITY',
    intro: 'Everything works without gestures, and text follows your phone’s size setting.',
    lines: [
      {
        key: 'TalkBack',
        what: 'Each task’s actions menu has complete, edit, add subtask, indent, outdent, move up/down, priority, due date, notes, collapse, delete.',
      },
      { key: 'Text size', what: 'Follows Android’s font size (up to 1.6×).' },
      { key: 'Reduce motion', what: 'When Android’s “Remove animations” is on, animations are skipped.' },
    ],
  },
];

/** "v0.9.0 (build 15)". */
function versionLabel(): string {
  const extra = Constants.expoConfig?.extra ?? {};
  return `v${String(extra.versionName)} (build ${String(extra.versionCode)})`;
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  // START HERE is open on arrival; the rest open on tap.
  const [open, setOpen] = useState<Set<string>>(() => new Set(['START HERE']));
  const toggle = (title: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header: same shape as the main screen, with a close button. */}
      <View style={styles.header}>
        <Text style={[type.display, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
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
        {SECTIONS.map((section) => {
          const isOpen = open.has(section.title);
          return (
            <View key={section.title} style={styles.section}>
              {/* Section header: tap to open or close. */}
              <Pressable
                onPress={() => toggle(section.title)}
                style={styles.sectionHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${section.title}, ${isOpen ? 'expanded' : 'collapsed'}`}
              >
                <Text style={[type.caretGlyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {isOpen ? g.expanded.glyph : g.collapsed.glyph}
                </Text>
                <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {section.title}
                </Text>
              </Pressable>
              {isOpen && (
                <View style={styles.body}>
                  <Text style={[type.subtask, styles.intro]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {section.intro}
                  </Text>
                  {section.lines.map((line) => (
                    <View key={line.key} style={styles.line}>
                      <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                        {line.key}
                      </Text>
                      <Text style={[type.notes, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                        {line.what}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
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
  section: { borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  // The whole header row is the tap target (≥ 52 pt tall).
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.rowMinHeight },
  body: { paddingBottom: space.md, paddingLeft: size.indent + space.md },
  intro: { color: colors.textBright, marginBottom: space.sm, ...platformText },
  line: { paddingVertical: space.sm },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, marginTop: space.xs, ...platformText },
  version: { color: colors.textDim, marginTop: space.xl, ...platformText },
});
