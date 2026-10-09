/**
 * components/list/TaskRow.tsx: one row of the ACTIVE list (PLAN §9.2).
 *
 * Layer: UI. Performance rules (ARCHITECTURE.md §8):
 *   - memoized; props are the row's derived data (depth, progress) only,
 *   - subscribes to *its own* task and to a boolean "am I being edited",
 *     so typing in one row never re-renders another,
 *   - renders a plain <Text> title; only the editing row mounts InlineEditor.
 *
 * Every top-level task has a divider line above it and an uppercase,
 * bright title (titleStyle.ts). One with subtasks is a **group**: it also
 * gets the `+` (add subtask) button and the [done/total] count.
 *
 * Completion (Phase 5): the checkbox and swipe-right check the task (with
 * cascade and auto-complete rules in lib/complete.ts); swipe-left deletes.
 * Checking plays the completion burst (CompleteBurst.tsx: the box pops, a
 * scan line crosses the row, "+N XP" rises). A checked top-level task then
 * holds 600 ms, slides out to the right as it fades, with its subtasks, and
 * moves to COMPLETED (PLAN §6.6). Every gesture has a screen-reader
 * action as an alternative (PLAN §13).
 */
import { memo, useEffect } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useMinute, useMinuteIf } from '@/components/common/useMinute';
import { InlineEditor } from '@/components/edit/InlineEditor';
import { NotesEditor, NotesView } from '@/components/edit/NotesField';
import { TaskChips } from '@/components/edit/ParsedChips';
import { ContextMenu } from '@/components/overlays/ContextMenu';
import { formatDue, isOverdue } from '@/lib/dates';
import type { Row } from '@/lib/flatten';
import { repeatLabel } from '@/lib/recurrence';
import { matchRange, type FoundRow } from '@/lib/search';
import { findTask } from '@/lib/taskMap';
import { isInSubtree } from '@/lib/tree';
import { shownTitle } from '@/lib/title';
import type { Task } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { remindersAvailable } from '@/services/reminderSupport';
import { repeatMultiplier } from '@/lib/xp';
import { ADVANCE_MS, type ToggleOutcome } from '@/store/createStore';
import { useActions, useAppStore } from '@/store/react';
import { colors, distance, duration, easing, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

import { Caret } from './Caret';
import { CheckGlyph, CompleteScan, useJustChecked, XpFloat } from './CompleteBurst';
import { FocusGlow } from './FocusGlow';
import { NestingGuides } from './NestingGuides';
import { QuestMeter } from './QuestMeter';
import { StrikeText } from './StrikeText';
import { titleStyles, titleVariant } from './titleStyle';
import { useRowDragGesture } from './drag';
import { HighlightFlash } from './HighlightFlash';
import { SwipeableRow } from './SwipeableRow';

/** The haptic for each checkbox outcome (PLAN §9.18). */
export function hapticFor(outcome: ToggleOutcome): void {
  if (outcome === 'moved-to-completed' || outcome === 'parent-completed' || outcome === 'repeated' || outcome === 'level-up')
    haptics.success();
  else haptics.check();
}

/** Priority marks, dim to bright (PLAN §9.12). */
const PRIORITY_COLOR = [colors.textDim, colors.textDim, colors.text, colors.accent] as const;

export const TaskRow = memo(
  function TaskRow({ row, first = false }: { row: Row; first?: boolean }) {
    const task = useAppStore((s) => findTask(s.tasks, row.id));
    const editing = useAppStore((s) => s.editingId === row.id);
    // Which field is being edited, only meaningful (and only subscribed) for the editing row.
    const field = useAppStore((s) => (s.editingId === row.id ? s.editingField : null));
    const notesOpen = useAppStore((s) => s.expandedNotes.includes(row.id));
    const menu = useAppStore((s) => s.menuFor === row.id);
    // Dimmed while it (or an ancestor) is being dragged: the subtree travels with the lifted row.
    const dimmed = useAppStore((s) => s.draggingId !== null && isInSubtree(s.tasks, row.id, s.draggingId));
    const dragGesture = useRowDragGesture(row.id);
    // Multi-select (PLAN §9.14): selecting a parent includes its subtree.
    const selecting = useAppStore((s) => s.selection !== null);
    const selected = useAppStore((s) => !!s.selection?.some((sel) => isInSubtree(s.tasks, row.id, sel)));
    // Search: the query to highlight, and whether this row is only shown as context for a match.
    const query = useAppStore((s) => (s.search.active.open ? s.search.active.query : ''));
    const context = 'context' in row && (row as FoundRow).context;
    // Only rows with a due date subscribe to the clock (for the spoken "due …, overdue").
    const now = useMinuteIf(task?.dueAt != null);
    // A just-completed quest, or a row inside one: they leave ACTIVE together.
    const lingering = useAppStore((s) => s.lingering.some((l) => isInSubtree(s.tasks, row.id, l)));
    // A repeating task just checked: struck for a moment, then back with its next date (PLAN §10.5).
    const advancing = useAppStore((s) => s.advancing.includes(row.id));
    const swipeOn = useAppStore((s) => s.settings.swipeActions);
    // The XP this row's check just earned (only this row re-renders for it).
    const gain = useAppStore((s) => (s.lastGain?.id === row.id ? s.lastGain.xp : 0));
    // Goes up each time this task is checked here: plays the completion burst.
    const fire = useJustChecked(row.id, !!task?.done || advancing);
    const actions = useActions();
    useEffect(() => {
      if (!advancing) return;
      const t = setTimeout(() => actions.releaseAdvancing(row.id), ADVANCE_MS);
      return () => clearTimeout(t);
    }, [advancing, actions, row.id]);

    // A just-completed top-level task: hold while the burst plays, then slide out to the
    // right while fading, with its subtask rows. The store lets it leave ACTIVE after
    // LINGER_MS (toggleDone).
    const opacity = useSharedValue(1);
    const slide = useSharedValue(0);
    useEffect(() => {
      if (!lingering) {
        opacity.set(1);
        slide.set(0);
        return;
      }
      const out = { duration: duration.base, easing };
      opacity.set(withDelay(timing.completeHold, withTiming(0, out)));
      slide.set(withDelay(timing.completeHold, withTiming(distance.exit, out)));
    }, [lingering, opacity, slide]);
    const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateX: slide.get() }] }));

    if (!task) return null; // removed between flatten and render

    const toggle = () => (selecting ? actions.toggleSelected(task.id) : hapticFor(actions.toggleDone(task.id)));
    /** A tap on the title: edit it, or (while selecting) select it. */
    const tapTitle = () => (selecting ? actions.toggleSelected(task.id) : actions.setEditing(task.id));
    const remove = () => {
      haptics.delete();
      actions.deleteTask(task.id);
    };
    // Screen-reader actions: everything a gesture or button can do (PLAN §13).
    const onAccessibilityAction = (e: AccessibilityActionEvent) => {
      const run: Record<string, () => void> = {
        complete: toggle,
        delete: remove,
        edit: () => actions.setEditing(task.id),
        menu: () => actions.openMenu(task.id),
        moveUp: () => actions.moveTaskBy(task.id, -1),
        moveDown: () => actions.moveTaskBy(task.id, 1),
        moveTo: () => actions.openMovePicker([task.id]),
        addSubtask: () => actions.addSubtask(task.id),
        indent: () => actions.indentTask(task.id),
        outdent: () => actions.outdentTask(task.id),
        priority: () => actions.cyclePriority(task.id),
        due: () => actions.openDueSheet(task.id),
        notes: () => actions.toggleNotes(task.id),
        collapse: () => actions.toggleCollapsed(task.id),
      };
      run[e.nativeEvent.actionName]?.();
    };

    // A quest: a true top-level task (no parent), with or without subtasks yet. Not
    // "depth 0 in this view": zoomed into a quest, its objectives are at depth 0 but
    // must still look and act like objectives (navigation pass 2026-10-09).
    const isQuest = task.parentId === null;
    const visualDepth = Math.min(row.depth, size.maxVisualDepth);
    // Group / subtask / top-level title size, shared with COMPLETED and the editor.
    const variant = titleVariant(isQuest ? 0 : Math.max(1, row.depth), row.hasChildren);
    const titleStyle = titleStyles[variant];

    return (
      <Animated.View style={[fadeStyle, (dimmed || context) && styles.dimmed]}>
        <SwipeableRow
          // Long-press (and hold still) to drag or open the menu: PLAN §9.10.
          drag={dragGesture}
          enabled={swipeOn && !editing && !selecting}
          right={{ label: `${glyphs.checkboxOn.glyph} ${task.done ? 'UNDO' : 'DONE'}`, onCommit: toggle }}
          left={{ label: `${glyphs.delete.glyph} DEL`, onCommit: remove }}
        >
          <Pressable
            style={[
              styles.row,
              { paddingLeft: space.lg + visualDepth * size.indent },
              // The first quest sits right under the fixed header divider: no second line.
              isQuest && !first && styles.topLevel,
              editing && styles.editing,
              selected && styles.selected,
            ]}
            accessible={!editing}
            accessibilityLabel={rowLabel(task, row, now)}
            // Quests are ordered by recent activity, so Move up / down only apply below them.
            accessibilityActions={isQuest ? QUEST_ACTIONS : ROW_ACTIONS}
            onAccessibilityAction={onAccessibilityAction}
          >
            {/* The soft green glow on the row being edited (PLAN §10.9). */}
            {editing && <FocusGlow />}
            {/* Flashes when the task is opened from a notification or link. */}
            <HighlightFlash rowId={row.id} />
            {/* The completion scan, behind the content. */}
            <CompleteScan fire={fire} />
            <NestingGuides levels={visualDepth} />

            {/* Caret: tap collapses/expands; long-press does it for all siblings. */}
            <Pressable
              style={styles.caret}
              hitSlop={HIT_SLOP}
              disabled={!row.hasChildren}
              onPress={() => actions.toggleCollapsed(task.id)}
              onLongPress={() => actions.setSiblingsCollapsed(task.id, !task.collapsed)}
              accessibilityRole="button"
              accessibilityLabel={`${task.collapsed ? 'Expand' : 'Collapse'} ${task.title || 'task'}`}
              accessibilityElementsHidden={!row.hasChildren}
            >
              {row.hasChildren && <Caret id={task.id} open={!task.collapsed} childCount={row.progress.total} style={styles.glyph} />}
            </Pressable>

            {/* Checkbox: a full 44 pt target. */}
            <Pressable
              style={styles.checkbox}
              hitSlop={HIT_SLOP}
              onPress={toggle}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: task.done }}
              accessibilityLabel={`${task.done ? 'Uncheck' : 'Complete'} ${task.title || 'task'}`}
            >
              <CheckGlyph
                fire={fire}
                done={task.done}
                glyph={task.done ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
                style={[type.glyph, styles.checkboxText]}
              />
            </Pressable>

            {/* Title (editor or text), then chips and notes while editing, or notes when expanded.
                The whole column is the tap target, not just the title's letters, so a
                short title is as easy to tap as a long one. Screen readers use the
                row's actions instead (accessible={false} keeps one element per row). */}
            <Pressable style={styles.title} onPress={editing ? undefined : tapTitle} disabled={editing} accessible={false}>
              {field === 'title' ? (
                <InlineEditor id={task.id} title={task.title} variant={variant} />
              ) : (
                <StrikeText
                  id={task.id}
                  text={shownTitle(task)}
                  struck={task.done || advancing}
                  color={isQuest ? colors.textBright : colors.text}
                  style={titleStyle}
                  onPress={tapTitle}
                  highlight={query ? matchRange(task.title, query) : null}
                />
              )}
              {/* Details sit on their own line under the title, so the title keeps
                  the full width (user request 2026-10-08). While editing, the
                  editing chips take their place. */}
              {editing ? <TaskChips id={task.id} /> : <RowMeta task={task} row={row} onNotes={() => actions.toggleNotes(task.id)} />}
              {field === 'notes' ? (
                <NotesEditor id={task.id} notes={task.notes} />
              ) : (
                (notesOpen || editing) && <NotesView notes={task.notes} onEdit={() => actions.setEditing(task.id, null, 'notes')} />
              )}
            </Pressable>

            {/* Every quest (top-level task) has "+" to add a subtask / objective, from the
                moment it's created, editing or not (user request 2026-10-09: every quest is
                meant to become a group). It takes the place of "+ NOTE" while editing a quest;
                notes stay one tap away on the toolbar's NOTE. */}
            {isQuest && (field === null || field === 'title') && (
              <Pressable
                onPress={() => actions.addSubtask(task.id)}
                hitSlop={HIT_SLOP}
                style={({ pressed }) => [styles.addSub, pressed && styles.addSubPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Add subtask to ${task.title || 'group'}`}
              >
                <Text style={[type.glyph, styles.addSubText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {glyphs.add.glyph}
                </Text>
              </Pressable>
            )}
            {/* Subtasks being edited without notes: the quiet "+ NOTE" affordance (PLAN §9.7). */}
            {!isQuest && field === 'title' && !task.notes ? (
              <Pressable
                onPress={() => actions.setEditing(task.id, null, 'notes')}
                hitSlop={HIT_SLOP}
                style={styles.addNote}
                accessibilityRole="button"
                accessibilityLabel="Add notes"
              >
                <Text style={[type.meta, styles.addNoteText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  + NOTE
                </Text>
              </Pressable>
            ) : null}
            {/* "+N XP" from this check, over everything (left of a quest's "+"). */}
            <XpFloat fire={fire} xp={gain} inset={isQuest ? QUEST_PLUS_WIDTH : 0} />
          </Pressable>
        </SwipeableRow>
        {menu && <ContextMenu id={task.id} onClose={actions.closeMenu} />}
      </Animated.View>
    );
  },
  // Rows are re-created on every flatten; compare by value so unchanged rows skip rendering.
  (a, b) =>
    a.row.id === b.row.id &&
    a.row.depth === b.row.depth &&
    a.row.hasChildren === b.row.hasChildren &&
    a.row.progress.done === b.row.progress.done &&
    a.row.progress.total === b.row.progress.total &&
    a.first === b.first,
);

/** The room a quest's "+" button takes at the row's right edge (its width plus its gap). */
const QUEST_PLUS_WIDTH = size.hitTarget + space.sm * 2;

/** Screen-reader alternatives to the row's gestures (PLAN §13). */
const ROW_ACTIONS = [
  { name: 'complete', label: 'Complete or uncomplete' },
  { name: 'edit', label: 'Edit title' },
  { name: 'addSubtask', label: 'Add subtask' },
  { name: 'indent', label: 'Indent' },
  { name: 'outdent', label: 'Outdent' },
  { name: 'moveUp', label: 'Move up' },
  { name: 'moveDown', label: 'Move down' },
  { name: 'moveTo', label: 'Move to…' },
  { name: 'priority', label: 'Change priority' },
  { name: 'due', label: 'Set due date' },
  { name: 'notes', label: 'Show or hide notes' },
  { name: 'collapse', label: 'Collapse or expand' },
  { name: 'menu', label: 'More actions' },
  { name: 'delete', label: 'Delete' },
];

/** A quest's actions: the same, without Move up / Move down (quests sort by recent activity). */
const QUEST_ACTIONS = ROW_ACTIONS.filter((a) => a.name !== 'moveUp' && a.name !== 'moveDown');

/** What a screen reader announces for a row, e.g. "Ship v2 build, high priority, repeats weekly, not done, 2 of 5 subtasks done". */
function rowLabel(task: Task, row: Row, now: number): string {
  const parts = [task.title || 'Untitled task'];
  if (task.parentId === null && row.hasChildren) parts.push('quest');
  if (task.priority > 0) parts.push(['', 'low', 'medium', 'high'][task.priority] + ' priority');
  if (task.dueAt !== null) {
    parts.push(`due ${formatDue(task.dueAt, now).toLowerCase()}${isOverdue(task.dueAt, task.done, now) ? ', overdue' : ''}`);
  }
  if (task.repeat) parts.push(`repeats ${repeatLabel(task.repeat).toLowerCase()}`);
  if (task.notify && task.dueAt !== null && remindersAvailable) parts.push('reminder on');
  parts.push(task.done ? 'done' : 'not done');
  if (row.hasChildren) parts.push(`${row.progress.done} of ${row.progress.total} subtasks done`);
  if (task.repeat && task.streak) parts.push(`on time ${task.streak} in a row`);
  if (task.collapsed && row.hasChildren) parts.push('collapsed');
  if (task.notes) parts.push('has notes');
  return parts.join(', ');
}

/** The details line under the title: depth badge, priority, ≡, due chip (◔ ↻), progress count. */
function RowMeta({ task, row, onNotes }: { task: Task; row: Row; onNotes: () => void }) {
  // Only the due chip needs the clock, so it subscribes on its own (DueChip).
  // `icon` parts are pure glyphs and use the 20%-larger metaGlyph role.
  const parts: { text: string; color: string; icon?: boolean }[] = [];
  if (row.depth > size.maxVisualDepth) parts.push({ text: `${glyphs.depthBadge.glyph}${row.depth}`, color: colors.textDim });
  if (task.priority > 0)
    parts.push({ text: glyphs.priority.glyph.repeat(task.priority), color: PRIORITY_COLOR[task.priority], icon: true });
  // ≡ is drawn separately below: it's a button that shows/hides the notes.
  // Repeating tasks on an on-time streak show their XP multiplier (lib/xp.ts).
  if (task.repeat && (task.streak ?? 0) > 0)
    parts.push({ text: `×${repeatMultiplier(task.streak!).toFixed(1)}`, color: colors.accent, icon: false });
  const progress = row.hasChildren;
  if (!parts.length && task.dueAt === null && !progress && !task.notes) return null;
  return (
    <View style={styles.meta}>
      {parts.map((p, i) => (
        <Text
          key={i}
          style={[p.icon ? type.metaGlyph : type.meta, styles.text, { color: p.color }]}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {p.text}
        </Text>
      ))}
      {task.notes !== '' && (
        <Pressable onPress={onNotes} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Show or hide notes">
          <Text style={[type.metaGlyph, styles.text, { color: colors.text }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.notes.glyph}
          </Text>
        </Pressable>
      )}
      {task.dueAt !== null && <DueChip task={task} dueAt={task.dueAt} />}
      {/* Subtask progress and the XP the quest will earn (QuestMeter.tsx). */}
      {progress && <QuestMeter task={task} done={row.progress.done} total={row.progress.total} />}
    </View>
  );
}

/** The due label (◔ ↻ FRI 16:00 / OVERDUE). Re-renders each minute, so it stays current. */
function DueChip({ task, dueAt }: { task: Task; dueAt: number }) {
  const now = useMinute();
  const actions = useActions();
  const overdue = isOverdue(dueAt, task.done, now);
  // Glyph prefixes (◔ notify, ↻ repeat) as nested spans at the larger metaGlyph size.
  const icons = `${task.notify && remindersAvailable ? `${glyphs.notify.glyph} ` : ''}${task.repeat ? `${glyphs.repeat.glyph} ` : ''}`;
  const label = formatDue(dueAt, now);
  return (
    <Text
      style={[type.meta, styles.text, { color: overdue ? colors.accent : colors.textDim }]}
      onPress={() => actions.openDueSheet(task.id)}
      suppressHighlighting
      accessibilityRole="button"
      accessibilityHint="Change the due date"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {icons !== '' && <Text style={type.metaGlyph}>{icons}</Text>}
      {overdue ? `${label} OVERDUE` : label}
    </Text>
  );
}

/**
 * Extends the caret and checkbox to at least 44 × 44 pt (PLAN §8.3, §13).
 * The glyphs are about 24 pt, so ~12 pt on each side reaches the target
 * without overlapping the neighbouring control.
 */
const HIT_SLOP = { top: space.md, bottom: space.md, left: space.md, right: space.md };

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.bg,
  },
  // Every top-level task is separated from the one above it, group or not
  // (user request 2026-10-08). Groups additionally use the uppercase `group` type.
  // Dragged subtrees and search-context rows: still legible, clearly secondary.
  dimmed: { opacity: 0.4 },
  // Selected in multi-select: raised background and an accent bar on the left.
  selected: { backgroundColor: colors.surfaceRaised, borderLeftWidth: shape.dropIndicator, borderLeftColor: colors.accent },
  topLevel: { borderTopWidth: shape.hairline, borderTopColor: colors.line, marginTop: space.sm },
  editing: { backgroundColor: colors.surface },
  // The caret's own column, plus a gap before the checkbox. The 31 pt glyph is taller
  // than a body line, so a negative margin keeps the row height unchanged.
  caret: {
    width: size.caretColumn,
    marginRight: size.caretGap,
    alignItems: 'center',
    marginVertical: (type.body.lineHeight - type.caretGlyph.lineHeight) / 2,
  },
  glyph: { color: colors.text, ...platformText },
  checkbox: { marginRight: space.md, marginLeft: space.xs },
  // Tighter brackets: `[ ]` reads as one compact box.
  checkboxText: { letterSpacing: shape.checkboxTracking, ...platformText },
  title: { flex: 1, minWidth: 0 },
  text: { ...platformText },
  // Offset so the smaller meta text sits on the title's first line.
  addSub: {
    minWidth: size.hitTarget,
    alignItems: 'center',
    marginLeft: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  addSubPressed: { backgroundColor: colors.surfaceRaised },
  addSubText: { color: colors.accent, ...platformText },
  addNote: { marginLeft: space.sm, paddingTop: (type.body.lineHeight - type.meta.lineHeight) / 2 },
  addNoteText: { color: colors.textDim, ...platformText },
  // The details line under the title: wraps onto more lines rather than squeezing anything.
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: space.xs, marginTop: space.xs },
});
