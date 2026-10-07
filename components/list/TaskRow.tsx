/**
 * components/list/TaskRow.tsx: one row of the ACTIVE list (PLAN §9.2).
 *
 * Layer: UI. Performance rules (ARCHITECTURE.md §8):
 *   - memoized; props are the row's derived data (depth, progress) only,
 *   - subscribes to *its own* task and to a boolean "am I being edited",
 *     so typing in one row never re-renders another,
 *   - renders a plain <Text> title; only the editing row mounts InlineEditor.
 *
 * A top-level task with children renders as a **group header**: uppercase
 * `group` type in textBright, with a divider line above it.
 *
 * Phase 4 scope: the checkbox is shown but inert; completion (with its
 * animations and cascade rules) arrives in Phase 5.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { InlineEditor } from '@/components/edit/InlineEditor';
import { formatDue, isOverdue } from '@/lib/dates';
import type { Row } from '@/lib/flatten';
import { findTask } from '@/lib/taskMap';
import type { Task } from '@/lib/types';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { NestingGuides } from './NestingGuides';

/** Priority marks, dim to bright (PLAN §9.12). */
const PRIORITY_COLOR = [colors.textDim, colors.textDim, colors.text, colors.accent] as const;

export const TaskRow = memo(
  function TaskRow({ row }: { row: Row }) {
    const task = useAppStore((s) => findTask(s.tasks, row.id));
    const editing = useAppStore((s) => s.editingId === row.id);
    const actions = useActions();
    if (!task) return null; // removed between flatten and render

    const isGroup = row.depth === 0 && row.hasChildren;
    const visualDepth = Math.min(row.depth, size.maxVisualDepth);
    const titleStyle = isGroup ? [type.group, { color: colors.textBright }] : [type.body, { color: task.done ? colors.textDim : colors.text }];

    return (
      <View
        style={[
          styles.row,
          { paddingLeft: space.lg + visualDepth * size.indent },
          isGroup && styles.group,
          editing && styles.editing,
        ]}
      >
        <NestingGuides levels={visualDepth} />

        {/* Caret: tap collapses/expands; long-press does it for all siblings. */}
        <Pressable
          style={styles.caret}
          hitSlop={HIT_SLOP}
          disabled={!row.hasChildren}
          onPress={() => actions.toggleCollapsed(task.id)}
          onLongPress={() => actions.setSiblingsCollapsed(task.id, !task.collapsed)}
          accessibilityRole="button"
          accessibilityLabel={task.collapsed ? 'Expand' : 'Collapse'}
          accessibilityElementsHidden={!row.hasChildren}
        >
          {row.hasChildren && (
            <Text style={[type.body, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {task.collapsed ? glyphs.collapsed.glyph : glyphs.expanded.glyph}
            </Text>
          )}
        </Pressable>

        {/* Checkbox: a full 44 pt target. Inert until Phase 5 (completion + animation + cascade). */}
        <Pressable
          style={styles.checkbox}
          hitSlop={HIT_SLOP}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.done }}
          accessibilityLabel={task.title}
        >
          <Text style={[type.body, styles.text, { color: task.done ? colors.textDim : colors.text }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {task.done ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
          </Text>
        </Pressable>

        {/* Title: the editor when editing, otherwise a tappable Text. */}
        <View style={styles.title}>
          {editing ? (
            <InlineEditor id={task.id} title={task.title} variant={isGroup ? 'group' : 'body'} />
          ) : (
            <Text
              style={[titleStyle, styles.text, task.done && styles.struck]}
              onPress={() => actions.setEditing(task.id)}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              suppressHighlighting
            >
              {task.title}
            </Text>
          )}
        </View>

        <RowMeta task={task} row={row} />
      </View>
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

/** Right-side indicators: depth badge, priority, ≡ ◔ ↻, due chip, progress count. */
function RowMeta({ task, row }: { task: Task; row: Row }) {
  // Only the due chip needs the clock, so it subscribes on its own (DueChip).
  const parts: { text: string; color: string }[] = [];
  if (row.depth > size.maxVisualDepth) parts.push({ text: `${glyphs.depthBadge.glyph}${row.depth}`, color: colors.textDim });
  if (task.priority > 0) parts.push({ text: glyphs.priority.glyph.repeat(task.priority), color: PRIORITY_COLOR[task.priority] });
  if (task.notes) parts.push({ text: glyphs.notes.glyph, color: colors.textDim });
  const progress = row.hasChildren ? `[${row.progress.done}/${row.progress.total}]` : null;
  if (!parts.length && task.dueAt === null && !progress) return null;
  return (
    <View style={styles.meta}>
      {parts.map((p, i) => (
        <Text key={i} style={[type.meta, styles.text, { color: p.color }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {p.text}
        </Text>
      ))}
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
  const overdue = isOverdue(dueAt, task.done, now);
  const label = `${task.notify ? `${glyphs.notify.glyph} ` : ''}${task.repeat ? `${glyphs.repeat.glyph} ` : ''}${formatDue(dueAt, now)}`;
  return (
    <Text style={[type.meta, styles.text, { color: overdue ? colors.accent : colors.textDim }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
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
  group: { borderTopWidth: shape.hairline, borderTopColor: colors.line, marginTop: space.sm },
  editing: { backgroundColor: colors.surface },
  caret: { width: size.indent, alignItems: 'center' },
  glyph: { color: colors.text, ...platformText },
  checkbox: { marginRight: space.md, marginLeft: space.xs },
  title: { flex: 1, minWidth: 0 },
  text: { ...platformText },
  // Phase 5 replaces this with the animated strikethrough line.
  struck: { textDecorationLine: 'line-through' },
  // Offset so the smaller meta text sits on the title's first line.
  meta: { flexDirection: 'row', gap: space.sm, marginLeft: space.sm, paddingTop: (type.body.lineHeight - type.meta.lineHeight) / 2 },
});
