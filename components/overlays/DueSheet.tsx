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
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMinute } from '@/components/common/useMinute';
import { addDays, atTimeOfDay, duePresets, formatDue, startOfDay } from '@/lib/dates';
import { repeatLabel } from '@/lib/recurrence';
import { findTask } from '@/lib/taskMap';
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

  /** CUSTOM…: native date picker, then time picker (Android dialogs). */
  const custom = () => {
    const start = new Date(task.dueAt ?? atTimeOfDay(addDays(now, 1), defaultTime));
    if (Platform.OS !== 'android') {
      setIosPicker(true);
      return;
    }
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      minimumDate: new Date(startOfDay(now)),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: start,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) return;
            const d = new Date(date);
            d.setHours(time.getHours(), time.getMinutes(), 0, 0);
            choose(d.getTime());
          },
        });
      },
    });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      {/* The backdrop isn't a screen-reader element (it would swallow the sheet's text);
          Android back closes the sheet instead. */}
      <Pressable style={styles.backdrop} onPress={close} accessible={false}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]} onPress={() => {}} accessible={false}>
          <Text style={[type.body, styles.title]} numberOfLines={2} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.prompt.glyph} ${forSelection ? `${selection?.length ?? 0} SELECTED TASKS` : task.title || 'Untitled task'}`}
          </Text>
          {task.dueAt !== null && (
            <Text style={[type.meta, styles.current]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`DUE ${formatDue(task.dueAt, now)}`}
            </Text>
          )}
          <View style={styles.divider} />

          {/* Presets: two per row. */}
          <View style={styles.grid}>
            {duePresets(now, defaultTime).map((p) => (
              <Option key={p.label} label={p.label} onPress={() => choose(p.at)} />
            ))}
            <Option label="CUSTOM…" onPress={custom} wide />
          </View>

          {/* Notify toggle. */}
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
        </Pressable>
      </Pressable>

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
    </Modal>
  );
}

/** One option button. */
function Option({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, wide && styles.wide, pressed && styles.pressed]}
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
