/**
 * components/edit/ParsedChips.tsx: the chips row under an input (PLAN §9.4, §12.3).
 *
 *   !!! HIGH · ◔ FRI 09:00 · NOTE          (what the typed shorthand will do)
 *   !! MED ✕ · ◔ TOMORROW 09:00 ✕          (the task's current values, clearable)
 *
 * Layer: UI. Two components:
 *   - ShorthandChips: live preview of shorthand in some text (quick-add bar,
 *     title editor). Tokens are stripped from the title when it's committed.
 *   - TaskChips: while editing a task, its current priority and due date,
 *     each with ✕ to clear. A value the typed shorthand will replace isn't shown.
 *
 * Parsing is pure (lib/parser.ts). `now` comes from the shared minute clock,
 * so renders stay pure and the preview stays current.
 */
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { formatDue } from '@/lib/dates';
import { parse, type ParseResult } from '@/lib/parser';
import { findTask } from '@/lib/taskMap';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

const PRIORITY_LABEL = ['', 'LOW', 'MED', 'HIGH'] as const;

/** Parses `text` with the user's default time at the current minute. */
export function useShorthand(text: string): ParseResult {
  const now = useMinute();
  const defaultTimeMinutes = useAppStore((s) => s.settings.defaultTimeMinutes);
  return parse(text, { now, defaultTimeMinutes });
}

/** One chip; with `onClear` it gets a ✕ that clears the value. */
function Chip({ label, onClear, a11y }: { label: string; onClear?: () => void; a11y: string }) {
  return (
    <View style={styles.chip}>
      <Text style={[type.meta, styles.chipText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
      {onClear && (
        <Pressable
          onPress={onClear}
          hitSlop={space.md}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${a11y}`}
        >
          <Text style={[type.metaGlyph, styles.clearText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.delete.glyph}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Live preview of the shorthand in `text`. Renders nothing for plain text. */
export function ShorthandChips({ result, style }: { result: ParseResult; style?: StyleProp<ViewStyle> }) {
  if (!result.chips.length) return null;
  return (
    <View style={[styles.row, style]} accessibilityLabel={`Shorthand: ${result.chips.map((c) => c.label).join(', ')}`}>
      {result.chips.map((c) => (
        <Chip key={c.kind} label={c.kind === 'due' ? `${glyphs.notify.glyph} ${c.label}` : c.label} a11y={c.kind} />
      ))}
    </View>
  );
}

/** While editing task `id`: shorthand preview plus its current priority and due date (clearable). */
export function TaskChips({ id }: { id: string }) {
  const task = useAppStore((s) => findTask(s.tasks, id));
  const actions = useActions();
  const now = useMinute();
  const parsed = useShorthand(task?.title ?? '');
  if (!task) return null;

  const showPriority = task.priority > 0 && parsed.priority === undefined;
  const showDue = task.dueAt !== null && parsed.dueAt === undefined;
  if (!parsed.chips.length && !showPriority && !showDue) return null;

  return (
    <View style={styles.row}>
      {parsed.chips.map((c) => (
        <Chip key={`p-${c.kind}`} label={c.kind === 'due' ? `${glyphs.notify.glyph} ${c.label}` : c.label} a11y={c.kind} />
      ))}
      {showPriority && (
        <Chip
          label={`${glyphs.priority.glyph.repeat(task.priority)} ${PRIORITY_LABEL[task.priority]}`}
          onClear={() => actions.setPriority(id, 0)}
          a11y="priority"
        />
      )}
      {showDue && (
        <Chip label={`${glyphs.notify.glyph} ${formatDue(task.dueAt!, now)}`} onClear={() => actions.clearDue(id)} a11y="due date" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.hitTarget - space.md,
    paddingHorizontal: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surfaceRaised,
  },
  chipText: { color: colors.accent, ...platformText },
  clear: { marginLeft: space.sm },
  clearText: { color: colors.text, ...platformText },
});
