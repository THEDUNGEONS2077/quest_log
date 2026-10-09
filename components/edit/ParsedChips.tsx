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
import { repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

const PRIORITY_LABEL = ['', 'LOW', 'MED', 'HIGH'] as const;

/**
 * Parses `text` with the user's default time at the current minute.
 * `literalFrom`: the saved title; its words are kept as typed, exactly as
 * they will be when the edit is applied (store commitEdit).
 * `existingDue`: the task's current due date, so "@5pm" previews as a new
 * time on the same day, as it will be applied.
 */
export function useShorthand(text: string, literalFrom?: string | null, existingDue?: number | null): ParseResult {
  const now = useMinute();
  const defaultTimeMinutes = useAppStore((s) => s.settings.defaultTimeMinutes);
  const literal = literalFrom ? new Set(literalFrom.split(/\s+/).filter(Boolean)) : undefined;
  // existingDue: amending a saved date keeps the parts not typed (lib/parser.ts).
  return parse(text, { now, defaultTimeMinutes, literal, existingDue });
}

/** One chip; with `onClear` it gets a ✕ that clears the value. */
function Chip({ label, onClear, onPress, a11y }: { label: string; onClear?: () => void; onPress?: () => void; a11y: string }) {
  return (
    <Pressable
      style={styles.chip}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={a11y}
    >
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
    </Pressable>
  );
}

/** A parsed chip's label, with its glyph for dates (◔) and repeats (↻). */
function chipLabel(kind: ParseResult['chips'][number]['kind'], label: string): string {
  if (kind === 'due') return `${glyphs.notify.glyph} ${label}`;
  if (kind === 'repeat') return `${glyphs.repeat.glyph} ${label}`;
  return label;
}

/** Live preview of the shorthand in `text`. Renders nothing for plain text. */
export function ShorthandChips({ result, style }: { result: ParseResult; style?: StyleProp<ViewStyle> }) {
  if (!result.chips.length) return null;
  return (
    <View style={[styles.row, style]} accessibilityLabel={`Shorthand: ${result.chips.map((c) => c.label).join(', ')}`}>
      {result.chips.map((c) => (
        <Chip key={c.kind} label={chipLabel(c.kind, c.label)} a11y={c.kind} />
      ))}
    </View>
  );
}

/** While editing task `id`: shorthand preview plus its current priority and due date (clearable). */
export function TaskChips({ id }: { id: string }) {
  const task = useAppStore((s) => findTask(s.tasks, id));
  const actions = useActions();
  const now = useMinute();
  // Preview exactly what finishing the edit will apply: the saved title's words stay literal.
  const startTitle = useAppStore((s) => (s.editingId === id ? s.editingStartTitle : null));
  const parsed = useShorthand(task?.title ?? '', startTitle, task?.dueAt ?? null);
  if (!task) return null;

  const showPriority = task.priority > 0 && parsed.priority === undefined;
  const showDue = task.dueAt !== null && parsed.dueAt === undefined;
  const showRepeat = task.repeat !== null && parsed.repeat === undefined;
  if (!parsed.chips.length && !showPriority && !showDue && !showRepeat) return null;

  return (
    <View style={styles.row}>
      {parsed.chips.map((c) => (
        <Chip key={`p-${c.kind}`} label={chipLabel(c.kind, c.label)} a11y={c.kind} />
      ))}
      {showPriority && (
        <Chip
          label={`${glyphs.priority.glyph.repeat(task.priority)} ${PRIORITY_LABEL[task.priority]}`}
          onClear={() => actions.setPriority(id, 0)}
          a11y="priority"
        />
      )}
      {showDue && (
        <Chip
          label={`${glyphs.notify.glyph} ${formatDue(task.dueAt!, now)}`}
          onPress={() => actions.openDueSheet(id)}
          onClear={() => actions.clearDue(id)}
          a11y="due date"
        />
      )}
      {showRepeat && (
        <Chip
          label={`${glyphs.repeat.glyph} ${repeatLabel(task.repeat!)}`}
          onPress={() => actions.openRepeatSheet(id)}
          onClear={() => actions.setRepeat(id, null)}
          a11y="repeat"
        />
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
