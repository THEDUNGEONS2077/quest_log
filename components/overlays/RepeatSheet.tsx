/**
 * components/overlays/RepeatSheet.tsx: choose how a task repeats (PLAN §9.9).
 *
 *   > Weekly review
 *   ────────────────────────────────
 *   [ DAILY ] [ WEEKDAYS ] [ WEEKLY ]
 *   [ MONTHLY ] [ YEARLY ]
 *   S  M  T  W  T  F  S             (weekly: tap days)
 *   EVERY  [ − ] 2 [ + ]  [ WEEKS ]  (custom interval)
 *   FROM   [ SCHEDULE ] [ AFTER DONE ]
 *   [ SAVE ]          [ STOP REPEATING ]
 *
 * Layer: UI. The rule is edited locally and saved in one step (one undo).
 * A task without a due date gets its first occurrence at the default time
 * (store.setRepeat). Opened from the due sheet, the long-press menu or a
 * repeat chip; the store's `repeatSheetFor` holds which task. The body is
 * keyed by task, so each opening starts from that task's rule.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRESETS, repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
import type { RepeatRule } from '@/lib/types';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const UNITS: { freq: RepeatRule['freq']; label: string }[] = [
  { freq: 'day', label: 'DAYS' },
  { freq: 'week', label: 'WEEKS' },
  { freq: 'month', label: 'MONTHS' },
  { freq: 'year', label: 'YEARS' },
];

export function RepeatSheet() {
  const id = useAppStore((s) => s.repeatSheetFor);
  return id ? <RepeatSheetBody key={id} id={id} /> : null;
}

function RepeatSheetBody({ id }: { id: string }) {
  const task = useAppStore((s) => findTask(s.tasks, id));
  const actions = useActions();
  const insets = useSafeAreaInsets();
  // Edit a local copy; nothing changes until SAVE.
  const [rule, setRule] = useState<RepeatRule>(() => task?.repeat ?? { ...PRESETS.weekly });
  if (!task) return null;

  const close = () => actions.closeRepeatSheet();
  const save = () => {
    actions.setRepeat(id, rule);
    close();
  };
  const preset = (r: RepeatRule) => setRule({ ...r, from: rule.from });
  const toggleDay = (d: number) => {
    const days = new Set(rule.weekdays ?? []);
    if (days.has(d)) days.delete(d);
    else days.add(d);
    setRule({ ...rule, freq: 'week', weekdays: days.size ? [...days].sort((a, b) => a - b) : undefined });
  };
  const isPreset = (r: RepeatRule) =>
    rule.freq === r.freq && rule.interval === r.interval && (rule.weekdays ?? []).join() === (r.weekdays ?? []).join();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      {/* The backdrop isn't a screen-reader element (it would swallow the sheet's text);
          Android back closes the sheet instead. */}
      <Pressable style={styles.backdrop} onPress={close} accessible={false}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]} onPress={() => {}} accessible={false}>
          <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} ${task.title || 'Untitled task'}`}
          </Text>
          <Text style={[type.meta, styles.summary]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.repeat.glyph} ${repeatLabel(rule)}`}
          </Text>
          <View style={styles.divider} />

          {/* Presets. */}
          <View style={styles.grid}>
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <Chip key={k} label={k.toUpperCase()} selected={isPreset(PRESETS[k])} onPress={() => preset(PRESETS[k])} />
            ))}
          </View>

          {/* Weekly: which days. */}
          {rule.freq === 'week' && (
            <View style={styles.days} accessibilityLabel="Repeat on days">
              {DAY_LETTERS.map((letter, d) => {
                const on = rule.weekdays?.includes(d) ?? false;
                return (
                  <Pressable
                    key={d}
                    onPress={() => toggleDay(d)}
                    style={[styles.day, on && styles.selected]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={DAY_NAMES[d]}
                  >
                    <Text style={[type.tab, on ? styles.accent : styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                      {letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Custom interval: EVERY [−] N [+] [UNIT]. */}
          <View style={styles.row}>
            <Text style={[type.tab, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              EVERY
            </Text>
            <Step label="−" a11y="Fewer" onPress={() => setRule({ ...rule, interval: Math.max(1, rule.interval - 1) })} />
            <Text
              style={[type.body, styles.count]}
              accessibilityLabel={`Every ${rule.interval}`}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {rule.interval}
            </Text>
            <Step label="+" a11y="More" onPress={() => setRule({ ...rule, interval: Math.min(99, rule.interval + 1) })} />
            <Chip
              label={UNITS.find((u) => u.freq === rule.freq)!.label}
              selected
              onPress={() => {
                // Cycle the unit; weekdays only apply to weeks.
                const i = UNITS.findIndex((u) => u.freq === rule.freq);
                const freq = UNITS[(i + 1) % UNITS.length]!.freq;
                setRule({ ...rule, freq, weekdays: freq === 'week' ? rule.weekdays : undefined });
              }}
            />
          </View>

          {/* Count from the schedule, or from when it was done. */}
          <View style={styles.row}>
            <Text style={[type.tab, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              FROM
            </Text>
            <Chip label="SCHEDULE" selected={rule.from === 'schedule'} onPress={() => setRule({ ...rule, from: 'schedule' })} />
            <Chip label="AFTER DONE" selected={rule.from === 'completion'} onPress={() => setRule({ ...rule, from: 'completion' })} />
          </View>

          <View style={[styles.row, styles.actions]}>
            <Chip label={`${glyphs.done.glyph} SAVE`} selected onPress={save} grow />
            {task.repeat && (
              <Chip
                label={`${glyphs.delete.glyph} STOP REPEATING`}
                onPress={() => {
                  actions.setRepeat(id, null);
                  close();
                }}
                grow
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A selectable option. */
function Chip({ label, selected, onPress, grow }: { label: string; selected?: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, grow && styles.grow, selected && styles.selected, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
    >
      <Text style={[type.tab, selected ? styles.accent : styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A − / + stepper button. */
function Step({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: shape.hairline,
    borderColor: colors.line,
    borderTopLeftRadius: shape.radius,
    borderTopRightRadius: shape.radius,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  title: { color: colors.textBright, ...platformText },
  summary: { color: colors.accent, marginTop: space.xs, ...platformText },
  divider: { height: shape.hairline, backgroundColor: colors.line, marginVertical: space.md, marginHorizontal: -space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  day: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  label: { color: colors.textDim, width: space.xl * 3, ...platformText },
  count: { color: colors.textBright, minWidth: space.xl, textAlign: 'center', ...platformText },
  actions: { marginTop: space.lg },
  chip: {
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  grow: { flexGrow: 1 },
  selected: { borderColor: colors.accent },
  pressed: { backgroundColor: colors.bg },
  step: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  accent: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
});
