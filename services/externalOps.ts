/**
 * services/externalOps.ts: the `ops.pending` queue (PLAN §6.4).
 *
 * Layer: services. Actions from outside the app's UI (notification
 * buttons now, the widget in Phase 12) are appended here first, then
 * drained into the store as normal, undoable ops (rules in
 * lib/externalOps.ts). Appending before applying means an action is never
 * lost: if the app dies mid-drain, the next drain finishes the job, and
 * each conversion is idempotent.
 */
import { type ExternalOp, parseQueue, toOp } from '@/lib/externalOps';
import type { AppStoreInstance } from '@/store/createStore';
import { KEYS, type KV } from '@/store/kv';

/** Adds an action to the persistent queue. */
export function appendExternalOp(kv: KV, op: ExternalOp): void {
  const queue = parseQueue(kv.getString(KEYS.opsPending));
  queue.push(op);
  kv.set(KEYS.opsPending, JSON.stringify(queue));
}

/**
 * Applies every queued action to the store, then clears the queue.
 * Each applied action is one undo step, with a toast saying where it came
 * from ("COMPLETED FROM NOTIFICATION · UNDO"). Returns how many changed something.
 */
export function drainExternalOps(kv: KV, store: AppStoreInstance): number {
  const queue = parseQueue(kv.getString(KEYS.opsPending));
  if (!queue.length) return 0;
  let applied = 0;
  let last: ExternalOp | null = null;
  for (const ext of queue) {
    const op = toOp(store.getState().tasks, ext);
    if (!op) continue; // already applied, or the task is gone
    store.getState().dispatch(op);
    applied++;
    last = ext;
  }
  // Clear only after applying: a crash in between re-drains harmlessly (idempotent).
  kv.remove(KEYS.opsPending);
  if (last) {
    const what = last.kind === 'complete' ? 'COMPLETED' : 'SNOOZED 15M';
    const from = last.source === 'widget' ? 'WIDGET' : 'NOTIFICATION';
    store.getState().showToast(applied > 1 ? `${applied} UPDATES FROM ${from}` : `${what} FROM ${from}`, true);
  }
  return applied;
}
