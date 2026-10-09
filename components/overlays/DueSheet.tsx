/**
 * components/overlays/DueSheet.tsx: set a due date and reminder (PLAN §9.8).
 *
 *   > Ship v2 build
 *   ─────────────────────────────
 *   IN 1H          TONIGHT 20:00
 *   TOMORROW 09:00 NEXT MON 09:00
 *   CUSTOM…
 *   ◔ NOTIFY                [ ON ]
 *   ↻ REPEAT…
 *   ✕ CLEAR DATE
 *
 * Layer: UI. Opened from the editing toolbar (◔ DUE), the long-press menu,
 * or a due chip; the store's `dueSheetFor` holds which task. The sheet sits
 * at the bottom of the screen with 44 pt+ targets. CUSTOM… opens the
 * native date picker, then the time picker.
 *
 * Notification permission isn't requested here. The reminders service asks
 * the moment the first reminder is actually scheduled. If it was denied,
 * the sheet explains it and links to system settings; the date itself
 * still works.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetModal } from './SheetModal';

import { useMinute } from '@/components/common/useMinute';
import { addDays, atTimeOfDay, duePresets, formatDue, minutesOfDay, nudgeDue, startOfDay, withDay } from '@/lib/dates';
import { repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
import { hasDialogPicker, pickDate, pickDateTime, pickTime } from '@/services/datePicker';
import { getPermissionState, openNotificationSettings, type PermissionState } from '@/services/notifications';
import { SELECTION } from '@/store/createStore';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** Renders the sheet for the task in `dueSheetFor`; keyed by task, so each opening starts fresh. */
export function DueSheet() {
  const id = useAppStore((s) => s.dueSheetFor);
  return id ? <DueSheetBody key={id} id={id} /> : null;
}

function DueSheetBody({ id }: { id: string }) {
  // Opened from multi-select (PLAN §9.14 DUE): the date applies to every selected task.
  const forSelection = id === SELECTION;
  const selection = useAppStore((s) => s.selection);
  const targetId = forSelection ? (selection?.[0] ?? '') : id;
  const task = useAppStore((s) => findTask(s.tasks, targetId));
  const notifyDefault = useAppStore((s) => s.settings.notifyByDefault);
  const defaultTime = useAppStore((s) => s.settings.defaultTimeMinutes);
  const actions = useActions();
  const insets = useSafeAreaInsets();
  const now = useMinute();
  // Starts from the task's notify flag, or the setting's default for a task without a date.
  const [notify, setNotify] = useState(() => (task && task.dueAt !== null ? task.notify : notifyDefault));
  const [permission, setPermission] = useState<PermissionState>('granted');
  const [iosPicker, setIosPicker] = useState(false);

  // Check permission once, for the "notifications are blocked" note.
  useEffect(() => {
    getPermissionState().then(setPermission);
  }, []);

  if (!task) return null;

  const close = () => actions.closeDueSheet();
  /** Applies a date (or null to clear) to the task, or to the whole selection. */
  const apply = (when: number | null, notifyOn: boolean) => {
    if (forSelection) {
      actions.setDueMany(selection ?? [], when, notifyOn);
      actions.clearSelection();
    } else actions.setDue(id, when, notifyOn);
  };
  const choose = (when: number) => {
    apply(when, notify);
    close();
  };

  // Amending an existing date (one task, not a selection).
  const amendable = !forSelection && task.dueAt !== null;
  /** CHANGE DATE…: pick a day; the time of day stays. */
  const changeDate = () => {
    if (task.dueAt === null) return;
    const due = task.dueAt;
    if (!hasDialogPicker) return setIosPicker(true);
    void pickDate(new Date(due), new Date(startOfDay(now))).then((d) => {
      if (d) choose(withDay(due, d.getTime()));
    });
  };
  /** CHANGE TIME…: pick a time; the day stays. */
  const changeTime = () => {
    if (task.dueAt === null) return;
    const due = task.dueAt;
    if (!hasDialogPicker) return setIosPicker(true);
    void pickTime(new Date(due)).then((t) => {
      if (t) choose(atTimeOfDay(due, minutesOfDay(t.getTime())));
    });
  };

  /** CUSTOM…: the system date and time picker (services/datePicker: Android dialogs, the browser's picker on web). */
  const custom = () => {
    const start = new Date(task.dueAt ?? atTimeOfDay(addDays(now, 1), defaultTime));
    if (!hasDialogPicker) {
      setIosPicker(true);
      return;
    }
    void pickDateTime(start, new Date(startOfDay(now))).then((d) => {
      if (d) choose(d.getTime());
    });
  };

  return (
    <SheetModal visible onClose={close} sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
      <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} ${forSelection ? `${selection?.length ?? 0} SELECTED TASKS` : task.title || 'Untitled task'}`}
      </Text>
      {task.dueAt !== null && (
        <Text style={[type.meta, styles.current]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`DUE ${formatDue(task.dueAt, now)}`}
        </Text>
      )}
      <View style={styles.divider} />

      {/* AMEND: a task that already has a date changes it without starting over
          (user request 2026-10-09). CHANGE DATE keeps the time, CHANGE TIME keeps
          the day, and the nudges move it from where it is. */}
      {amendable && (
        <>
          <Text style={[type.meta, styles.section]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
            AMEND
          </Text>
          <View style={styles.grid}>
            <Option label="CHANGE DATE…" onPress={changeDate} />
            <Option label="CHANGE TIME…" onPress={changeTime} />
            <Option label="+1 HOUR" onPress={() => choose(nudgeDue(task.dueAt!, 'hour'))} third />
            <Option label="+1 DAY" onPress={() => choose(nudgeDue(task.dueAt!, 'day'))} third />
            <Option label="+1 WEEK" onPress={() => choose(nudgeDue(task.dueAt!, 'week'))} third />
          </View>
          <Text
            style={[type.meta, styles.section, styles.sectionGap]}
            accessibilityRole="header"
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            NEW DATE
          </Text>
        </>
      )}

      {/* Presets: two per row. */}
      <View style={styles.grid}>
        {duePresets(now, defaultTime).map((p) => (
          <Option key={p.label} label={p.label} onPress={() => choose(p.at)} />
        ))}
        <Option label="CUSTOM…" onPress={custom} wide />
      </View>

      {/* Notify toggle. Where reminders can't exist (the web build), a note instead. */}
      {permission === 'unsupported' ? (
        <Text style={[type.meta, styles.noteText, styles.note]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          Reminders need the Android app. Here, due dates still show and turn OVERDUE.
        </Text>
      ) : (
        <Pressable
          onPress={() => setNotify((n) => !n)}
          style={styles.toggleRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: notify }}
          accessibilityLabel="Send a notification"
        >
          <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            <Text style={type.glyph}>{glyphs.notify.glyph}</Text> NOTIFY
          </Text>
          <Text style={[type.tab, notify ? styles.on : styles.off]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {notify ? '[ ON ]' : '[ OFF ]'}
          </Text>
        </Pressable>
      )}
      {notify && permission === 'denied' && (
        <Pressable onPress={openNotificationSettings} style={styles.note} accessibilityRole="button">
          <Text style={[type.meta, styles.noteText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            Notifications are blocked for quest_log. The date still works. Tap to open settings.
          </Text>
        </Pressable>
      )}

      {/* Repeat: its own sheet (PLAN §9.9). One task at a time. */}
      {!forSelection && (
        <Option
          label={`${glyphs.repeat.glyph} ${task.repeat ? `REPEAT: ${repeatLabel(task.repeat)}` : 'REPEAT…'}`}
          onPress={() => {
            close();
            actions.openRepeatSheet(id);
          }}
          wide
        />
      )}

      {(task.dueAt !== null || forSelection) && (
        <Option
          label={`${glyphs.delete.glyph} CLEAR DATE`}
          onPress={() => {
            apply(null, false);
            close();
          }}
          wide
        />
      )}

      {/* iOS has no imperative dialog: an inline picker (Phase 15 polishes this). */}
      {iosPicker && (
        <DateTimePicker
          value={new Date(task.dueAt ?? now)}
          mode="datetime"
          onChange={(e, d) => {
            setIosPicker(false);
            if (e.type === 'set' && d) choose(d.getTime());
          }}
        />
      )}
    </SheetModal>
  );
}

/** One option button. */
function Option({ label, onPress, wide, third }: { label: string; onPress: () => void; wide?: boolean; third?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, wide && styles.wide, third && styles.third, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.tab, styles.optionText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  current: { color: colors.accent, marginTop: space.xs, ...platformText },
  divider: { height: shape.hairline, backgroundColor: colors.line, marginVertical: space.md, marginHorizontal: -space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    // Two per row: each grows from a basis under half the width, so the gap fits.
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: size.rowMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
    marginTop: space.sm,
  },
  wide: { flexBasis: '100%' },
  // Three per row (the AMEND nudges).
  third: { flexBasis: '28%' },
  section: { color: colors.textDim, marginBottom: space.sm, ...platformText },
  sectionGap: { marginTop: space.md },
  pressed: { borderColor: colors.accent },
  optionText: { color: colors.accent, ...platformText },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.rowMinHeight,
    marginTop: space.sm,
  },
  text: { color: colors.text, ...platformText },
  on: { color: colors.accent, ...platformText },
  off: { color: colors.textDim, ...platformText },
  note: { paddingVertical: space.sm },
  noteText: { color: colors.textBright, ...platformText },
});
