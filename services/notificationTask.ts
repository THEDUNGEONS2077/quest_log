/**
 * services/notificationTask.ts: handles DONE / SNOOZE 15M taps while the
 * app is in the background or closed (PLAN §6.4, Android headless path).
 *
 * Layer: services. Imported once, for its side effect, at the top of
 * app/_layout.tsx: TaskManager requires the task to be defined at module
 * load, before any UI, because Android may start the JS runtime *only* to
 * run this task, with no screen at all.
 *
 * Flow for a button tap with the app closed:
 *   1. append the action to `ops.pending` (never lost, even if we're killed),
 *   2. drain it into the store (same rules as in-app: cascade, auto-complete),
 *   3. flush persistence right away (the OS may stop us right after),
 *   4. remove the tapped notification and re-sync reminders (a snooze
 *      schedules the new one).
 * The store module hydrates synchronously from MMKV when first imported,
 * so the task sees the user's real data.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import type { ExternalOp } from '@/lib/externalOps';
import { dueAtOf } from '@/lib/reminders';
import { appStore, flushPersistence, kv } from '@/store';

import { appendExternalOp, drainExternalOps } from './externalOps';
import { ACTION_DONE, ACTION_SNOOZE, dismissShown, NOTIFICATION_TASK, syncReminders } from './notifications';

/** Turns a notification button response into a queued action, or null for other responses. */
export function externalOpFromResponse(response: Notifications.NotificationResponse, at: number): ExternalOp | null {
  const kind = response.actionIdentifier === ACTION_DONE ? 'complete' : response.actionIdentifier === ACTION_SNOOZE ? 'snooze' : null;
  const taskId = response.notification.request.content.data?.taskId;
  if (!kind || typeof taskId !== 'string') return null;
  // The occurrence this notification was for (keeps repeating-task DONE idempotent).
  const dueAt = dueAtOf(response.notification.request.identifier) ?? undefined;
  return { kind, taskId, at, source: 'notification', dueAt };
}

/** Handles a DONE/SNOOZE response: queue, apply, save, tidy the tray, re-sync. */
export async function handleActionResponse(response: Notifications.NotificationResponse): Promise<void> {
  const ext = externalOpFromResponse(response, Date.now());
  if (!ext) return;
  appendExternalOp(kv, ext);
  drainExternalOps(kv, appStore);
  flushPersistence();
  dismissShown(response.notification.request.identifier);
  await syncReminders(() => appStore.getState().tasks);
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
  // Only button responses matter here; a plain tap opens the app (handled in app/_layout.tsx).
  if (error || !data || !('actionIdentifier' in data)) return;
  await handleActionResponse(data);
});
