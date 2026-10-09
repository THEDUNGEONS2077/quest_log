/**
 * components/overlays/ContextMenu.tsx: the long-press menu for an ACTIVE
 * task (PLAN §12.6).
 *
 *   > Ship v2 build
 *   ────────────────────────────
 *   PRIORITY  [ — ][ ! ][ !! ][ !!! ]
 *   ◔ Change due date / time…   (first: the most common reason to hold a dated task)
 *   + Add subtask
 *   → Indent          ← Outdent
 *   ≡ Notes
 *   ↻ Repeat…
 *   ⊞ Duplicate
 *   ⎕ Copy as text
 *   ✕ Delete
 *
 * Layer: UI. Everything here is also reachable without editing the task,
 * so structure and details can be changed from the list directly. Zoom,
 * select and move join in Phases 9–10.
 */
import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, questCategory } from '@/lib/quests';
import { repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
import { shownTitle } from '@/lib/title';
import type { Priority } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { useState } from 'react';

import type { SortKey } from '@/lib/bulk';

import { ActionSheet, type SheetAction } from './ActionSheet';

interface Props {
  id: string;
  onClose: () => void;
}

export function ContextMenu({ id, onClose }: Props) {
  const task = useAppStore((s) => findTask(s.tasks, id));
  const hasChildren = useAppStore((s) => (s.tasks.children[id]?.length ?? 0) > 0);
  const actions = useActions();
  // "Sort subtasks…" and "Category…" each open a second, small sheet.
  const [sorting, setSorting] = useState(false);
  const [choosingCategory, setChoosingCategory] = useState(false);
  if (!task) return null;

  if (choosingCategory) {
    const current = questCategory(task);
    return (
      <ActionSheet
        visible
        title={`Category of ${task.title || 'quest'}`}
        onClose={onClose}
        actions={CATEGORIES.map((c) => ({
          glyph: c.key === current ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph,
          label: c.label,
          onPress: () => {
            if (c.key !== current) actions.setQuestCategory(id, c.key);
          },
        }))}
      />
    );
  }

  if (sorting) {
    const sort = (key: SortKey) => () => actions.sortSubtasks(id, key);
    return (
      <ActionSheet
        visible
        title={`Sort subtasks of ${shownTitle(task) || 'task'}`}
        onClose={onClose}
        actions={[
          { glyph: glyphs.priority.glyph, label: 'By priority (high first)', onPress: sort('priority') },
          { glyph: glyphs.notify.glyph, label: 'By due date (soonest first)', onPress: sort('due') },
          { glyph: 'A', label: 'A–Z', onPress: sort('alpha') },
        ]}
      />
    );
  }

  const items: SheetAction[] = [
    // The due date comes first: amending it is the most common reason to hold a dated task
    // (user request 2026-10-09). The sheet offers CHANGE DATE / CHANGE TIME and +1 nudges.
    {
      glyph: glyphs.notify.glyph,
      label: task.dueAt !== null ? 'Change due date / time…' : 'Due date / reminder…',
      onPress: () => actions.openDueSheet(id),
    },
    // Quests (top level) belong to a tab: DAILY, MAIN or MISC (lib/quests.ts).
    ...(task.parentId === null
      ? [
          {
            glyph: glyphs.moveTo.glyph,
            label: `Category: ${CATEGORIES.find((c) => c.key === questCategory(task))!.label}…`,
            onPress: () => setChoosingCategory(true),
            keepOpen: true,
          },
        ]
      : []),
    { glyph: glyphs.add.glyph, label: 'Add subtask', onPress: () => actions.addSubtask(id) },
    { glyph: glyphs.indent.glyph, label: 'Indent', onPress: () => actions.indentTask(id) },
    { glyph: glyphs.outdent.glyph, label: 'Outdent', onPress: () => actions.outdentTask(id) },
    { glyph: glyphs.notes.glyph, label: task.notes ? 'Edit notes' : 'Add notes', onPress: () => actions.setEditing(id, null, 'notes') },
    {
      glyph: glyphs.repeat.glyph,
      label: task.repeat ? `Repeat: ${repeatLabel(task.repeat).toLowerCase()}` : 'Repeat…',
      onPress: () => actions.openRepeatSheet(id),
    },
    ...(hasChildren ? [{ glyph: glyphs.zoom.glyph, label: 'Zoom into', onPress: () => actions.setZoom(id) }] : []),
    { glyph: glyphs.select.glyph, label: 'Select (several tasks)', onPress: () => actions.startSelection(id) },
    { glyph: glyphs.moveTo.glyph, label: 'Move to…', onPress: () => actions.openMovePicker([id]) },
    ...(hasChildren ? [{ glyph: glyphs.priority.glyph, label: 'Sort subtasks…', onPress: () => setSorting(true), keepOpen: true }] : []),
    { glyph: glyphs.duplicate.glyph, label: 'Duplicate', onPress: () => actions.duplicateTask(id) },
    {
      glyph: glyphs.copy.glyph,
      label: 'Copy as text',
      onPress: () => {
        Clipboard.setStringAsync(actions.outlineText(id))
          .then(() => actions.showToast('COPIED'))
          .catch(() => actions.showToast('COPY FAILED'));
      },
    },
    {
      glyph: glyphs.delete.glyph,
      label: 'Delete',
      onPress: () => {
        haptics.delete();
        actions.deleteTask(id);
      },
    },
  ];

  return (
    <ActionSheet visible title={shownTitle(task) || 'Untitled task'} actions={items} onClose={onClose}>
      <PrioritySelector value={task.priority} onChange={(p) => actions.setPriority(id, p)} />
    </ActionSheet>
  );
}

/** `[ — ][ ! ][ !! ][ !!! ]`: sets priority in one tap; the current one is highlighted. */
function PrioritySelector({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const options: { p: Priority; label: string; a11y: string }[] = [
    { p: 0, label: '—', a11y: 'No priority' },
    { p: 1, label: '!', a11y: 'Low priority' },
    { p: 2, label: '!!', a11y: 'Medium priority' },
    { p: 3, label: '!!!', a11y: 'High priority' },
  ];
  return (
    <View style={styles.priority} accessibilityRole="radiogroup">
      <Text style={[type.meta, styles.priorityLabel]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        PRIORITY
      </Text>
      {options.map((o) => (
        <Pressable
          key={o.p}
          onPress={() => onChange(o.p)}
          style={[styles.segment, value === o.p && styles.segmentOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.p }}
          accessibilityLabel={o.a11y}
        >
          <Text
            style={[type.glyph, { color: value === o.p ? colors.accent : colors.text }, styles.text]}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  priority: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  priorityLabel: { color: colors.textDim, marginRight: space.xs, ...platformText },
  segment: {
    flex: 1,
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  segmentOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  text: { ...platformText },
});
