/**
 * app/settings.tsx: Settings (PLAN §9.17), opened from ⚙ in the header.
 *
 *   > settings                              ✕
 *   BEHAVIOR       notify by default · default time · swipes · auto-clear
 *   FEEL           boot screen · haptics · reduce motion
 *   NOTIFICATIONS  permission status · open system settings
 *   DATA           save backup · share backup · import · restore · Trash
 *   HELP           guide · what's new · version
 *
 * Layer: UI (Expo Router screen). Settings save as soon as they change
 * (store `updateSettings`, persisted as `settings.v1`). Import and restore
 * are previewed first, then applied as one undo step; the screen then
 * returns to the list, where the toast offers UNDO.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/overlays/ActionSheet';
import { backupFileName, countDocument, type DocCounts, makeBackup } from '@/lib/backup';
import { atTimeOfDay, formatMinutes, startOfDay } from '@/lib/dates';
import type { TasksDocument } from '@/lib/types';
import { appBuild, appVersion } from '@/services/appInfo';
import { pickBackupText, saveBackupToFolder, shareBackup } from '@/services/backup';
import { getPermissionState, openNotificationSettings, type PermissionState } from '@/services/notifications';
import { BackupError, parseBackup } from '@/store/backup';
import { useActions, useAppStore } from '@/store/react';
import type { Settings } from '@/store/settings';
import { colors, glyphs as g, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** Default-time choices offered where the system time picker isn't used. */
const TIME_PRESETS = [7, 8, 9, 12, 18, 20].map((h) => h * 60);

/** "12 ACTIVE · 34 COMPLETED · 2 IN TRASH". */
function countsLabel(c: DocCounts): string {
  return [`${c.active} ACTIVE`, `${c.completed} COMPLETED`, ...(c.trash ? [`${c.trash} IN TRASH`] : [])].join(' · ');
}

/** A sheet the screen can show: its title and choices. */
interface Sheet {
  title: string;
  actions: SheetAction[];
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useAppStore((s) => s.settings);
  const actions = useActions();
  const set = (patch: Partial<Settings>) => actions.updateSettings(patch);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // One status line for the Data section ("> BACKUP SAVED …", errors).
  const [status, setStatus] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  useEffect(() => {
    void getPermissionState().then(setPermission);
  }, []);

  // --- Behavior ---
  const pickDefaultTime = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(atTimeOfDay(startOfDay(Date.now()), settings.defaultTimeMinutes)),
        mode: 'time',
        is24Hour: true,
        onChange: (e, date) => {
          if (e.type === 'set' && date) set({ defaultTimeMinutes: date.getHours() * 60 + date.getMinutes() });
        },
      });
      return;
    }
    setSheet({
      title: 'DEFAULT TIME',
      actions: TIME_PRESETS.map((m) => ({ glyph: g.notify.glyph, label: formatMinutes(m), onPress: () => set({ defaultTimeMinutes: m }) })),
    });
  };
  const pickAutoClear = () =>
    setSheet({
      title: 'AUTO-CLEAR COMPLETED',
      actions: (['off', 30, 90] as const).map((v) => ({
        glyph: settings.autoClearCompleted === v ? g.checkboxOn.glyph : g.checkboxOff.glyph,
        label: v === 'off' ? 'Off' : `After ${v} days`,
        onPress: () => set({ autoClearCompleted: v }),
      })),
    });
  const pickReduceMotion = () =>
    setSheet({
      title: 'REDUCE MOTION',
      actions: (['system', 'on', 'off'] as const).map((v) => ({
        glyph: settings.reduceMotion === v ? g.checkboxOn.glyph : g.checkboxOff.glyph,
        label: v === 'system' ? 'Follow Android' : v === 'on' ? 'Always' : 'Never',
        onPress: () => set({ reduceMotion: v }),
      })),
    });

  // --- Data ---
  const backupJson = () => {
    const now = Date.now();
    const file = makeBackup(actions.exportDocument(), now, { version: appVersion(), build: appBuild() });
    return { json: JSON.stringify(file), name: backupFileName(now) };
  };
  const saveBackup = async () => {
    const { json, name } = backupJson();
    try {
      if (await saveBackupToFolder(json, name)) setStatus(`BACKUP SAVED: ${name}`);
    } catch {
      setStatus('COULDN’T SAVE THERE. TRY ANOTHER FOLDER, OR SHARE INSTEAD.');
    }
  };
  const share = async () => {
    const { json, name } = backupJson();
    try {
      await shareBackup(json, name);
    } catch {
      setStatus('COULDN’T OPEN SHARING.');
    }
  };
  /** Back to the list, where the UNDO toast for the import is shown. */
  const doneWithData = () => router.back();
  const importBackup = async () => {
    setStatus(null);
    let doc: TasksDocument;
    let exportedAt: number | null;
    try {
      const text = await pickBackupText();
      if (text === null) return;
      ({ doc, exportedAt } = parseBackup(text));
    } catch (e) {
      setStatus(e instanceof BackupError ? e.message.toUpperCase() : 'COULDN’T READ THAT FILE.');
      return;
    }
    const when = exportedAt ? new Date(exportedAt).toLocaleString() : 'unknown date';
    setSheet({
      title: `BACKUP FROM ${when.toUpperCase()}\n${countsLabel(countDocument(doc))}`,
      actions: [
        {
          glyph: g.add.glyph,
          label: 'Merge: add tasks you don’t have',
          onPress: () => {
            actions.importTasks(doc, 'merge');
            doneWithData();
          },
        },
        {
          glyph: g.undo.glyph,
          label: 'Replace: swap everything for the backup',
          onPress: () => {
            actions.importTasks(doc, 'replace');
            doneWithData();
          },
        },
      ],
    });
  };
  const restore = () => {
    const snapshots = actions.listSnapshots();
    setSheet({
      title: snapshots.length
        ? 'RESTORE A DAILY SNAPSHOT\nReplaces everything; UNDO brings it back.'
        : 'NO SNAPSHOTS YET (ONE IS TAKEN EACH DAY)',
      actions: snapshots.map((snap) => ({
        glyph: g.undo.glyph,
        label: `${snap.date} · ${countsLabel(snap.counts)}`,
        onPress: () => {
          if (actions.restoreSnapshot(snap.key)) doneWithData();
          else setStatus('THAT SNAPSHOT COULDN’T BE READ.');
        },
      })),
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[type.display, styles.accent]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${g.prompt.glyph} settings`}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {g.delete.glyph}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        <Section title="BEHAVIOR">
          <Toggle
            label="Remind me by default"
            hint="New due dates get a notification"
            value={settings.notifyByDefault}
            onChange={(v) => set({ notifyByDefault: v })}
          />
          <Choice
            label="Default time"
            hint="For dates without a time, like @fri"
            value={formatMinutes(settings.defaultTimeMinutes)}
            onPress={pickDefaultTime}
          />
          <Toggle
            label="Swipe actions"
            hint="Swipe right to complete, left to delete"
            value={settings.swipeActions}
            onChange={(v) => set({ swipeActions: v })}
          />
          <Choice
            label="Auto-clear completed"
            hint="Moves old completed tasks to Trash when the app starts"
            value={settings.autoClearCompleted === 'off' ? 'OFF' : `${settings.autoClearCompleted} DAYS`}
            onPress={pickAutoClear}
          />
        </Section>

        <Section title="FEEL">
          <Toggle
            label="Boot screen"
            hint="The start-up text when the app opens"
            value={settings.bootSequence}
            onChange={(v) => set({ bootSequence: v })}
          />
          <Toggle label="Haptics" hint="Small vibrations on actions" value={settings.haptics} onChange={(v) => set({ haptics: v })} />
          <Choice
            label="Reduce motion"
            hint="Skip animations"
            value={settings.reduceMotion === 'system' ? 'ANDROID' : settings.reduceMotion === 'on' ? 'ALWAYS' : 'NEVER'}
            onPress={pickReduceMotion}
          />
        </Section>

        <Section title="NOTIFICATIONS">
          <Choice
            label="Permission"
            hint={
              permission === 'denied' ? 'Reminders can’t show. Allow them in Android settings.' : 'Asked the first time a reminder is set'
            }
            value={permission === null ? '…' : permission === 'granted' ? 'ALLOWED' : permission === 'denied' ? 'BLOCKED' : 'NOT ASKED YET'}
            onPress={openNotificationSettings}
          />
          <Action glyph={g.settings.glyph} label="Open Android settings for quest_log" onPress={openNotificationSettings} />
        </Section>

        <Section title="DATA">
          <Text style={[type.notes, styles.dim, styles.intro]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            Everything stays on this phone. A backup is a file you keep; uninstalling the app deletes its data, so save one first.
          </Text>
          <Action glyph={g.save.glyph} label="Save backup to a folder" onPress={() => void saveBackup()} />
          <Action glyph={g.share.glyph} label="Share backup…" onPress={() => void share()} />
          <Action glyph={g.load.glyph} label="Import a backup…" onPress={() => void importBackup()} />
          <Action glyph={g.undo.glyph} label="Restore a daily snapshot…" onPress={restore} />
          <Action glyph={g.delete.glyph} label="Trash" onPress={() => router.push('/trash')} />
          {status !== null && (
            <Text
              style={[type.meta, styles.accent, styles.status]}
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {`${g.prompt.glyph} ${status}`}
            </Text>
          )}
        </Section>

        <Section title="HELP">
          <Action glyph={g.help.glyph} label="User guide" onPress={() => router.push('/help')} />
          <Action glyph={g.prompt.glyph} label="What's new" onPress={() => router.push('/whats-new')} />
          <Text style={[type.meta, styles.dim, styles.version]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`quest_log v${appVersion()} (build ${appBuild()}) · offline, no accounts, no tracking`}
          </Text>
        </Section>
      </ScrollView>

      <ActionSheet visible={sheet !== null} title={sheet?.title ?? ''} actions={sheet?.actions ?? []} onClose={() => setSheet(null)} />
    </View>
  );
}

/** A titled group of rows. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text
        style={[type.group, styles.bright, styles.sectionTitle]}
        accessibilityRole="header"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Label and hint on the left, `[ON ]` / `[OFF]` on the right; the whole row toggles. */
function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <RowText label={label} hint={hint} />
      <Text style={[type.tab, value ? styles.accent : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {value ? '[ON ]' : '[OFF]'}
      </Text>
    </Pressable>
  );
}

/** Label and hint on the left, the current value on the right; opens a chooser. */
function Choice({ label, hint, value, onPress }: { label: string; hint: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={hint}
    >
      <RowText label={label} hint={hint} />
      <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {value}
      </Text>
    </Pressable>
  );
}

/** A one-line action button. */
function Action({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.glyph, styles.accent, styles.actionGlyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {glyph}
      </Text>
      <Text style={[type.body, styles.text, styles.grow]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

function RowText({ label, hint }: { label: string; hint: string }) {
  return (
    <View style={styles.grow}>
      <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
      <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
  },
  close: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  pressed: { backgroundColor: colors.surface },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  section: { paddingTop: space.lg, borderBottomWidth: shape.hairline, borderBottomColor: colors.line, paddingBottom: space.sm },
  sectionTitle: { marginBottom: space.xs },
  intro: { marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.rowMinHeight, paddingVertical: space.sm },
  grow: { flex: 1 },
  actionGlyph: { width: size.indent, textAlign: 'center' },
  status: { marginTop: space.sm },
  version: { marginTop: space.md },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
