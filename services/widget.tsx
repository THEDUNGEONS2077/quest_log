/**
 * services/widget.tsx: keeps the home screen widget up to date
 * (PLAN §11.2).
 *
 * Layer: services (native boundary: react-native-android-widget). Android
 * only; every function here is a no-op elsewhere (the iOS widget is
 * Phase 15).
 *
 *   tasks change ──(throttled 2 s)──► buildSnapshot ──► widget.snapshot (MMKV)
 *                                                  └──► redraw every placed widget
 *
 * Redraws also happen when the app comes to the foreground and at local
 * midnight while it's running (so "today" and "OVERDUE" roll over), and
 * Android redraws every 30 minutes on its own (updatePeriodMillis in
 * app.config.ts), which keeps due labels fresh while the app is closed.
 */
import { AppState, Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { addDays, startOfDay } from '@/lib/dates';
import { buildSnapshot, parseSnapshot, type WidgetSnapshot } from '@/lib/widget';
import type { AppStoreInstance } from '@/store/createStore';
import { KEYS, type KV } from '@/store/kv';
import { QuestWidget } from '@/widgets/android/QuestWidget';

/** The widget's name in app.config.ts (react-native-android-widget plugin). */
export const WIDGET_NAME = 'QuestWidget';

/** Snapshot throttle (PLAN §11.2). */
const THROTTLE_MS = 2000;

/** Android only (read at call time, so tests can switch platforms). */
const isAndroid = () => Platform.OS === 'android';

/** The stored snapshot, or null if none (or unreadable). */
export function readSnapshot(kv: KV): WidgetSnapshot | null {
  return parseSnapshot(kv.getString(KEYS.widgetSnapshot));
}

/** Stores a snapshot. */
export function writeSnapshot(kv: KV, snapshot: WidgetSnapshot): void {
  kv.set(KEYS.widgetSnapshot, JSON.stringify(snapshot));
}

/** The widget element for one placed widget, at the current time. */
export function renderQuestWidget(snapshot: WidgetSnapshot | null, size: { width: number; height: number }) {
  return <QuestWidget snapshot={snapshot} width={size.width} height={size.height} now={Date.now()} />;
}

/** Redraws every placed widget from `snapshot`. Errors are swallowed: the widget must never crash the app. */
export async function redrawWidgets(snapshot: WidgetSnapshot | null): Promise<void> {
  if (!isAndroid()) return;
  try {
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => renderQuestWidget(snapshot, info) });
  } catch {
    // No widget support (or none placed): nothing to update.
  }
}

/** Builds and stores a fresh snapshot from the store, then redraws. */
export async function refreshWidget(store: AppStoreInstance, kv: KV): Promise<void> {
  if (!isAndroid()) return;
  const snapshot = buildSnapshot(store.getState().tasks, Date.now());
  writeSnapshot(kv, snapshot);
  await redrawWidgets(snapshot);
}

/**
 * Starts keeping the widget in step with the store (app UI only; the
 * headless handlers call refreshWidget themselves). Returns a stop function.
 */
export function startWidgetSync(store: AppStoreInstance, kv: KV): () => void {
  if (!isAndroid()) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) return; // a refresh is already pending: it will see this change too
    timer = setTimeout(() => {
      timer = null;
      void refreshWidget(store, kv);
    }, THROTTLE_MS);
  };

  // Midnight: re-arm a timer for each next local midnight.
  let midnight: ReturnType<typeof setTimeout> | null = null;
  const armMidnight = () => {
    const now = Date.now();
    midnight = setTimeout(
      () => {
        void refreshWidget(store, kv);
        armMidnight();
      },
      addDays(startOfDay(now), 1) - now + 1000,
    );
  };
  armMidnight();

  schedule(); // at launch: the snapshot may predate changes made elsewhere
  const unsubTasks = store.subscribe((s) => s.tasks, schedule);
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule();
  });
  return () => {
    unsubTasks();
    appState.remove();
    if (timer) clearTimeout(timer);
    if (midnight) clearTimeout(midnight);
  };
}
