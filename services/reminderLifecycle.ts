/**
 * services/reminderLifecycle.ts: keeps reminders in step with the app
 * (PLAN §7.3 startup steps 3–4, §9.8 reconciliation).
 *
 * Layer: services. Started once from app/_layout.tsx:
 *   - at start: set up notifications, drain queued DONE/SNOOZE actions,
 *     reconcile the OS schedule (and handle a tap that launched the app),
 *   - on every return to the foreground: drain + reconcile again,
 *   - after task changes: reconcile, debounced, so a burst of edits
 *     costs one pass,
 *   - notification responses while the app runs: DONE/SNOOZE go through the
 *     queue; tapping the notification body opens the task.
 * Returns a cleanup function.
 */
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import type { AppStoreInstance } from '@/store/createStore';
import type { KV } from '@/store/kv';

import { drainExternalOps } from './externalOps';
import { setupNotifications, syncReminders } from './notifications';
import { handleActionResponse } from './notificationTask';

/** Wait after the last task change before reconciling. */
const SYNC_DEBOUNCE_MS = 1000;

export function startReminders(store: AppStoreInstance, kv: KV, onOpenTask: (taskId: string) => void): () => void {
  const sync = () => syncReminders(() => store.getState().tasks);

  /** A response to one of our notifications: a button, or a tap on the body. */
  const onResponse = (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      const taskId = response.notification.request.content.data?.taskId;
      if (typeof taskId === 'string') onOpenTask(taskId);
    } else {
      handleActionResponse(response).catch(() => {});
    }
  };

  // Start: setup, then drain anything queued while we were closed, then reconcile.
  setupNotifications().then(() => {
    drainExternalOps(kv, store);
    sync();
    // The app was launched by tapping a notification: open that task once.
    const launch = Notifications.getLastNotificationResponse();
    if (launch) {
      onResponse(launch);
      Notifications.clearLastNotificationResponse();
    }
  });

  // Back to the foreground: actions may have been taken, and time has passed.
  const appState = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    drainExternalOps(kv, store);
    sync();
  });

  // Task changes (dates, done, deletes, titles): reconcile after a quiet moment.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = store.subscribe(
    (s) => s.tasks,
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, SYNC_DEBOUNCE_MS);
    },
  );

  const responses = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    appState.remove();
    unsubscribe();
    responses.remove();
    if (timer) clearTimeout(timer);
  };
}
