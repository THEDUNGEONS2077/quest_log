/**
 * services/notifications.web.ts: reminders on the web build / iPhone PWA
 * (native version: notifications.ts).
 *
 * Layer: services. A web app can't schedule local notifications on an
 * iPhone: Safari only offers server-sent push, and quest_log has no server
 * and no network access. So reminders are unavailable here. Due dates still
 * show, sort and turn OVERDUE, and the `notify` flag is kept on each task,
 * so the reminder works if the same tasks are imported into the Android app.
 * Every function matches the native module and does nothing.
 */
import type { TasksState } from '@/lib/types';

/** 'unsupported': this platform can't show reminders at all. */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Nothing to set up on the web. */
export async function setupNotifications(): Promise<void> {}

/** Reminders aren't available in the web build. */
export async function getPermissionState(): Promise<PermissionState> {
  return 'unsupported';
}

/** There are no notification settings to open on the web. */
export function openNotificationSettings(): void {}

/** Nothing is scheduled on the web. */
export async function syncReminders(_getTasks: () => TasksState): Promise<void> {}

/** No notifications are ever shown on the web. */
export function dismissShown(_identifier: string): void {}
