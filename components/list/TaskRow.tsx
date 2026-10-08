/**
 * components/list/TaskRow.tsx: one row of the ACTIVE list (PLAN §9.2).
 *
 * Layer: UI. Performance rules (ARCHITECTURE.md §8):
 *   - memoized; props are the row's derived data (depth, progress) only,
 *   - subscribes to *its own* task and to a boolean "am I being edited",
 *     so typing in one row never re-renders another,
 *   - renders a plain <Text> title; only the editing row mounts InlineEditor.
 *
 * Every top-level task has a divider line above it. A top-level task with
 * children also renders as a **group header**: uppercase `group` type in
 * textBright.
 *
 * Completion (Phase 5): the checkbox and swipe-right check the task (with
 * cascade and auto-complete rules in lib/complete.ts); swipe-left deletes.
 * A checked top-level task stays for its strike + 500 ms hold, fades out
 * and moves to COMPLETED (PLAN §6.6). Every gesture has a screen-reader
 * action as an alternative (PLAN §13).
 */
import { memo, useEffect, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useMinute, useMinuteIf } from '@/components/common/useMinute';
import { InlineEditor } from '@/components/edit/InlineEditor';
import { NotesEditor, NotesView } from '@/components/edit/NotesField';
import { TaskChips } from '@/components/edit/ParsedChips';
import { ContextMenu } from '@/components/overlays/ContextMenu';
import { formatDue, isOverdue } from '@/lib/dates';
import type { Row } from '@/lib/flatten';
import { findTask } from '@/lib/taskMap';
import type { Task } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { ADVANCE_MS, LINGER_MS, type ToggleOutcome } from '@/store/createStore';
import { useActions, useAppStore } from '@/store/react';
import { colors, duration, easing, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

import { NestingGuides } from './NestingGuides';
import { StrikeText } from './StrikeText';
import { titleStyles, titleVariant } from './titleStyle';
import { HighlightFlash } from './HighlightFlash';
import { SwipeableRow } from './SwipeableRow';

/** The haptic for each checkbox outcome (PLAN §9.18). */
export function hapticFor(outcome: ToggleOutcome): void {
  if (outcome === 'moved-to-completed' || outcome === 'parent-completed' || outcome === 'repeated') haptics.success();
  else haptics.check();
}

/** Priority marks, dim to bright (PLAN §9.12). */
const PRIORITY_COLOR = [colors.textDim, colors.textDim, colors.text, colors.accent] as const;

export const TaskRow = memo(
  function TaskRow({ row }: { row: Row }) {
    const task = useAppStore((s) => findTask(s.tasks, row.id));
    const editing = useAppStore((s) => s.editingId === row.id);
    // Which field is being edited, only meaningful (and only subscribed) for the editing row.
    const field = useAppStore((s) => (s.editingId === row.id ? s.editingField : null));
    const notesOpen = useAppStore((s) => s.expandedNotes.includes(row.id));
    const [menu, setMenu] = useState(false);
    // Only rows with a due date subscribe to the clock (for the spoken "due …, overdue").
    const now = useMinuteIf(task?.dueAt != null);
    const lingering = useAppStore((s) => s.lingering.includes(row.id));
    // A repeating task just checked: struck for a moment, then back with its next date (PLAN §10.5).
    const advancing = useAppStore((s) => s.advancing.includes(row.id));
    const swipeOn = useAppStore((s) => s.settings.swipeActions);
    const actions = useActions();
    useEffect(() => {
      if (!advancing) return;
      const t = setTimeout(() => actions.releaseAdvancing(row.id), ADVANCE_MS);
      return () => clearTimeout(t);
    }, [advancing, actions, row.id]);

    // A just-completed top-level task: hold while the strike plays, fade, then leave ACTIVE.
    const opacity = useSharedValue(1);
    useEffect(() => {
      if (!lingering) {
        opacity.value = 1;
        return;
      }
      opacity.value = withDelay(timing.completeHold, withTiming(0, { duration: duration.base, easing }));
      const t = setTimeout(() => actions.releaseLingering(row.id), LINGER_MS);
      return () => clearTimeout(t);
    }, [lingering, opacity, actions, row.id]);
    const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    if (!task) return null; // removed between flatten and render

    const toggle = () => hapticFor(actions.toggleDone(task.id));
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
        menu: () => setMenu(true),
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

    const isGroup = row.depth === 0 && row.hasChildren;
    const visualDepth = Math.min(row.depth, size.maxVisualDepth);
    // Group / subtask / top-level title size, shared with COMPLETED and the editor.
    const variant = titleVariant(row.depth, row.hasChildren);
    const titleStyle = titleStyles[variant];

    return (
      <Animated.View style={fadeStyle}>
        <SwipeableRow
          enabled={swipeOn && !editing}
          right={{ label: `${glyphs.checkboxOn.glyph} ${task.done ? 'UNDO' : 'DONE'}`, onCommit: toggle }}
          left={{ label: `${glyphs.delete.glyph} DEL`, onCommit: remove }}
        >
          <Pressable
            style={[
              styles.row,
              { paddingLeft: space.lg + visualDepth * size.indent },
              row.depth === 0 && styles.topLevel,
              editing && styles.editing,
            ]}
            accessible={!editing}
            accessibilityLabel={rowLabel(task, row, now)}
            accessibilityActions={ROW_ACTIONS}
            // Long-press anywhere on the row opens the context menu (PLAN §12.6).
            onLongPress={() => setMenu(true)}
            delayLongPress={400}
            disabled={editing}
            onAccessibilityAction={onAccessibilityAction}
          >
            {/* Flashes when the task is opened from a notification or link. */}
            <HighlightFlash rowId={row.id} />
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
              {row.hasChildren && (
                <Text style={[type.caretGlyph, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {task.collapsed ? glyphs.collapsed.glyph : glyphs.expanded.glyph}
                </Text>
              )}
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
              <Text
                style={[type.glyph, styles.checkboxText, { color: task.done ? colors.textDim : colors.text }]}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              >
                {task.done ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
              </Text>
            </Pressable>

            {/* Title (editor or text), then chips and notes while editing, or notes when expanded. */}
            <View style={styles.title}>
              {field === 'title' ? (
                <InlineEditor id={task.id} title={task.title} variant={variant} />
              ) : (
                <StrikeText
                  text={task.title}
                  struck={task.done || advancing}
                  color={isGroup ? colors.textBright : colors.text}
                  style={titleStyle}
                  onPress={() => actions.setEditing(task.id)}
                  onLongPress={() => setMenu(true)}
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
            </View>

            {/* While editing the title of a task without notes: the quiet "+ NOTE" affordance (PLAN §9.7). */}
            {/* Group headers: "+" adds a subtask straight from the title (user request 2026-10-08). */}
            {isGroup && !editing && (
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
            {field === 'title' && !task.notes ? (
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
          </Pressable>
        </SwipeableRow>
        {menu && <ContextMenu id={task.id} onClose={() => setMenu(false)} />}
      </Animated.View>
    );
  },
  // Rows are re-created on every flatten; compare by value so unchanged rows skip rendering.
  (a, b) =>
    a.row.id === b.row.id &&
    a.row.depth === b.row.depth &&
    a.row.hasChildren === b.row.hasChildren &&
    a.row.progress.done === b.row.progress.done &&
    a.row.progress.total === b.row.progress.total,
);

/** Screen-reader alternatives to the row's gestures (PLAN §13). */
const ROW_ACTIONS = [
  { name: 'complete', label: 'Complete or uncomplete' },
  { name: 'edit', label: 'Edit title' },
  { name: 'addSubtask', label: 'Add subtask' },
  { name: 'indent', label: 'Indent' },
  { name: 'outdent', label: 'Outdent' },
  { name: 'priority', label: 'Change priority' },
  { name: 'due', label: 'Set due date' },
  { name: 'notes', label: 'Show or hide notes' },
  { name: 'collapse', label: 'Collapse or expand' },
  { name: 'menu', label: 'More actions' },
  { name: 'delete', label: 'Delete' },
];

/** What a screen reader announces for a row, e.g. "Ship v2 build, high priority, not done, 2 of 5 subtasks done". */
function rowLabel(task: Task, row: Row, now: number): string {
  const parts = [task.title || 'Untitled task'];
  if (row.depth === 0 && row.hasChildren) parts.push('group');
  if (task.priority > 0) parts.push(['', 'low', 'medium', 'high'][task.priority] + ' priority');
  if (task.dueAt !== null) {
    parts.push(`due ${formatDue(task.dueAt, now).toLowerCase()}${isOverdue(task.dueAt, task.done, now) ? ', overdue' : ''}`);
  }
  if (task.notify && task.dueAt !== null) parts.push('reminder on');
  parts.push(task.done ? 'done' : 'not done');
  if (row.hasChildren) parts.push(`${row.progress.done} of ${row.progress.total} subtasks done`);
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
  const progress = row.hasChildren ? `[${row.progress.done}/${row.progress.total}]` : null;
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
      {progress && (
        <Text style={[type.meta, styles.text, { color: colors.textDim }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {progress}
        </Text>
      )}
    </View>
  );
}

/** The due label (◔ ↻ FRI 16:00 / OVERDUE). Re-renders each minute, so it stays current. */
function DueChip({ task, dueAt }: { task: Task; dueAt: number }) {
  const now = useMinute();
  const actions = useActions();
  const overdue = isOverdue(dueAt, task.done, now);
  // Glyph prefixes (◔ notify, ↻ repeat) as nested spans at the larger metaGlyph size.
  const icons = `${task.notify ? `${glyphs.notify.glyph} ` : ''}${task.repeat ? `${glyphs.repeat.glyph} ` : ''}`;
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
  topLevel: { borderTopWidth: shape.hairline, borderTopColor: colors.line, marginTop: space.sm },
  editing: { backgroundColor: colors.surface },
  caret: { width: size.indent, alignItems: 'center' },
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
