/**
 * components/dev/StorePanel.tsx: temporary store and persistence check
 * panel (Phase 3).
 *
 * Layer: UI. Lets you verify on the phone, before the real list exists
 * (Phase 4), that:
 *   - tasks persist across killing and relaunching the app,
 *   - undo works,
 *   - the 7,500-task seed loads, and the app stays responsive with it.
 * It shows counts and the load status, plus a few buttons. Phase 4 removes
 * it, together with the theme check screen.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { generateSeed } from '@/scripts/seed';
import { findTask } from '@/lib/taskMap';
import { createEmptyState } from '@/lib/tree';
import { appStore, selectors, useAppStore } from '@/store';
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

export function StorePanel() {
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

  const s = appStore.getState();
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
        <Button label="+ ADD TASK" onPress={() => timed(() => s.addTask(null, `task ${counts.active + 1}`))} />
        <Button label="UNDO" onPress={() => canUndo && timed(() => s.undo())} />
        <Button label="LOAD SEED (7,500)" onPress={() => timed(() => s.replaceAll(generateSeed({ now: Date.now() })))} />
        <Button label="CLEAR ALL" onPress={() => timed(() => s.replaceAll(createEmptyState()))} />
      </View>

      {/* The first few active rows, so added tasks are visible. */}
      {rows.slice(0, 5).map((r) => (
        <RowLine key={r.id} id={r.id} depth={r.depth} />
      ))}
    </View>
  );
}

/** One row. It subscribes to its own task only, the pattern the real list uses (ARCHITECTURE.md §8). */
function RowLine({ id, depth }: { id: string; depth: number }) {
  const title = useAppStore((st) => findTask(st.tasks, id)?.title ?? '');
  return (
    <Text style={[styles.text, type.body]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {`${'  '.repeat(depth)}[ ] ${title}`}
    </Text>
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
