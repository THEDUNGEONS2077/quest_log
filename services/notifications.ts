/**
 * services/notifications.ts: local due-date reminders (PLAN §9.8).
 *
 * Layer: services (native side effects). The only module that talks to
 * expo-notifications for scheduling. Rules about *which* reminders should
 * exist live in lib/reminders.ts; this module makes the OS match them.
 *
 *   setupNotifications()   once at startup: channel, DONE/SNOOZE buttons,
 *                          foreground display, background task registration
 *   syncReminders(tasks)   reconcile the OS schedule with the task tree
 *                          (launch, foreground, and after task changes);
 *                          safe to call any number of times
 *
 * Permission is asked for only when the first reminder is actually needed
 * (PLAN §3), never at launch. Exact timing: the app declares USE_EXACT_ALARM
 * (a reminder app distributed outside the Play Store may), so Android grants
 * exact alarms without a settings detour. After a reboot, expo-notifications
 * restores the schedule itself (RECEIVE_BOOT_COMPLETED).
 */
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { desiredReminders, reconcile } from '@/lib/reminders';
import type { TasksState } from '@/lib/types';
import { colors } from '@/theme';

/** The Android channel all reminders use (PLAN §9.8: high importance). */
/** True: Android shows reminders (the web build's version of this module says false). */
export const remindersAvailable = true;

export const CHANNEL_ID = 'reminders';
/** Notification category carrying the DONE and SNOOZE buttons. */
export const CATEGORY_ID = 'task';
/** Action identifiers for the two buttons. */
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';
/** Background task name (defined in services/notificationTask.ts). */
export const NOTIFICATION_TASK = 'questlog-notification-actions';

/**
 * Permission state for the UI (DueSheet note, Settings). 'unsupported': this
 * platform can't show reminders at all (the web build / iPhone PWA).
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/**
 * One-time setup at app start. Safe to call again (all steps are
 * idempotent upserts). Errors are swallowed: a device without notification
 * support must still run the app.
 */
export async function setupNotifications(): Promise<void> {
  try {
    // Show reminders even while the app is open.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      description: 'Due-date reminders for your tasks',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: colors.accent,
      vibrationPattern: [0, 200, 100, 200],
    });
    // Both buttons act without opening the app (handled by the background task).
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_DONE, buttonTitle: 'DONE', options: { opensAppToForeground: false } },
      { identifier: ACTION_SNOOZE, buttonTitle: 'SNOOZE 15M', options: { opensAppToForeground: false } },
    ]);
    await Notifications.registerTaskAsync(NOTIFICATION_TASK);
  } catch {
    // Notifications unavailable: the rest of the app works without them.
  }
}

/** Current permission state, without prompting. */
export async function getPermissionState(): Promise<PermissionState> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'denied';
  }
}

/** Opens the system settings page for this app (to grant a denied permission). */
export function openNotificationSettings(): void {
  Linking.openSettings().catch(() => {});
}

// Syncs run one at a time; a request during a run schedules exactly one more run.
let running: Promise<void> | null = null;
let again = false;

/**
 * Makes the OS schedule match the task tree. Asks for permission the first
 * time a reminder is needed. Concurrent calls collapse into at most one
 * extra run with the latest state (via `getTasks`).
 */
export function syncReminders(getTasks: () => TasksState): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce(getTasks());
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** One reconcile pass. */
async function syncOnce(tasks: TasksState): Promise<void> {
  try {
    const desired = desiredReminders(tasks, Date.now());
    let permission = await getPermissionState();
    // First reminder ever: ask now, in context (PLAN §3: only when needed).
    if (desired.length && permission === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      permission = status === 'granted' ? 'granted' : 'denied';
    }
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier);
    // Without permission nothing can be shown: clear ours, schedule nothing.
    const plan = reconcile(permission === 'granted' ? desired : [], scheduled);
    await Promise.all(plan.cancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    for (const r of plan.schedule) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.identifier,
        content: {
          title: r.title,
          body: r.body || undefined,
          data: { taskId: r.taskId },
          categoryIdentifier: CATEGORY_ID,
          color: colors.accent,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL_ID },
      });
    }
  } catch {
    // A failed sync is retried on the next launch/foreground/change.
  }
}

/** Removes a shown notification from the tray (after DONE or SNOOZE). */
export function dismissShown(identifier: string): void {
  Notifications.dismissNotificationAsync(identifier).catch(() => {});
}
