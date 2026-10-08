/**
 * services/reminderLifecycle.web.ts: the web build has no reminders
 * (services/notifications.web.ts explains why), so there's no schedule to
 * keep in step and no notification taps to handle.
 *
 * Layer: services. Same signature as reminderLifecycle.ts.
 */
import type { AppStoreInstance } from '@/store/createStore';
import type { KV } from '@/store/kv';

/** Does nothing on the web; returns a no-op stop function. */
export function startReminders(_store: AppStoreInstance, _kv: KV, _onOpenTask: (taskId: string) => void): () => void {
  return () => {};
}
