/**
 * components/dev/StorePanel.tsx: test-data tools on the dev screen.
 *
 * Layer: UI. Shows counts and the load status, and can:
 *   - load the 7,500-task seed for performance checks (PLAN §5),
 *   - clear everything.
 * Both replace the user's tasks, so each asks for confirmation first.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { generateSeed } from '@/scripts/seed';
import { createEmptyState } from '@/lib/tree';
import { useActions, useAppStore, useSelectors } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** A terminal-style text button: `[ LABEL ]`. */
function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={[styles.text, type.meta, { color: colors.accent }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`[ ${label} ]`}
      </Text>
    </Pressable>
  );
}

/** Asks before an action that replaces all tasks. */
function confirmReplace(what: string, run: () => void) {
  Alert.alert(what, 'This replaces ALL your tasks and cannot be undone.', [
    { text: 'CANCEL', style: 'cancel' },
    { text: 'REPLACE', style: 'destructive', onPress: run },
  ]);
}

export function StorePanel() {
  const selectors = useSelectors();
  // Narrow subscriptions: the panel re-renders only when these change.
  const counts = useAppStore((s) => selectors.counts(s, Date.now()));
  const rows = useAppStore((s) => selectors.activeRows(s));
  const loadStatus = useAppStore((s) => s.loadStatus);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date().toLocaleTimeString());

  // A ticking clock makes it obvious that the app is live, not frozen.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  /** Runs an action and records how long it took, to show on screen. */
  const timed = (fn: () => void) => {
    const t0 = performance.now();
    fn();
    setLastMs(performance.now() - t0);
  };

  const s = useActions();
  return (
    <View>
      <Text style={[styles.text, type.meta]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`LOADED: ${loadStatus.toUpperCase()} · ${now}`}
      </Text>
      <Text style={[styles.text, type.body, { color: colors.textBright }]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${counts.active} ACTIVE · ${counts.completed} COMPLETED · ${counts.overdue} OVERDUE`}
      </Text>
      <Text style={[styles.text, type.meta]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${rows.length} VISIBLE ROWS${lastMs === null ? '' : ` · LAST ACTION ${lastMs.toFixed(1)} MS`}`}
      </Text>

      <View style={styles.buttons}>
        <Button label="UNDO" onPress={() => canUndo && timed(() => s.undo())} />
        <Button
          label="LOAD SEED (7,500)"
          onPress={() => confirmReplace('Load 7,500 test tasks?', () => timed(() => s.replaceAll(generateSeed({ now: Date.now() }))))}
        />
        <Button label="CLEAR ALL" onPress={() => confirmReplace('Delete all tasks?', () => timed(() => s.replaceAll(createEmptyState())))} />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, ...platformText },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.md },
  button: {
    minHeight: size.hitTarget,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
});
