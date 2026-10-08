/**
 * components/overlays/ContextMenu.tsx: the long-press menu for an ACTIVE
 * task (PLAN §12.6).
 *
 *   > Ship v2 build
 *   ────────────────────────────
 *   PRIORITY  [ — ][ ! ][ !! ][ !!! ]
 *   + Add subtask
 *   → Indent          ← Outdent
 *   ≡ Notes
 *   ◔ Due / remind…
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

import { repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
import type { Priority } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { ActionSheet, type SheetAction } from './ActionSheet';

interface Props {
  id: string;
  onClose: () => void;
}

export function ContextMenu({ id, onClose }: Props) {
  const task = useAppStore((s) => findTask(s.tasks, id));
  const actions = useActions();
  if (!task) return null;

  const items: SheetAction[] = [
    { glyph: glyphs.add.glyph, label: 'Add subtask', onPress: () => actions.addSubtask(id) },
    { glyph: glyphs.indent.glyph, label: 'Indent', onPress: () => actions.indentTask(id) },
    { glyph: glyphs.outdent.glyph, label: 'Outdent', onPress: () => actions.outdentTask(id) },
    { glyph: glyphs.notes.glyph, label: task.notes ? 'Edit notes' : 'Add notes', onPress: () => actions.setEditing(id, null, 'notes') },
    {
      glyph: glyphs.notify.glyph,
      label: task.dueAt !== null ? 'Change due date…' : 'Due / remind…',
      onPress: () => actions.openDueSheet(id),
    },
    {
      glyph: glyphs.repeat.glyph,
      label: task.repeat ? `Repeat: ${repeatLabel(task.repeat).toLowerCase()}` : 'Repeat…',
      onPress: () => actions.openRepeatSheet(id),
    },
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
    <ActionSheet visible title={task.title || 'Untitled task'} actions={items} onClose={onClose}>
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
