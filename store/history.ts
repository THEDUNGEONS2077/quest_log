/**
 * store/history.ts: the undo/redo history (PLAN §9.13).
 *
 * Layer: store. Pure functions over an immutable history value; the store
 * calls them from its actions. History lives in memory only (it isn't
 * persisted).
 */
import type { Op } from '@/lib/ops';

/** History depth (PLAN §9.13: ring buffer of 100). */
export const HISTORY_LIMIT = 100;

/** One undoable step. */
export interface HistoryEntry {
  /** Applying this undoes the step. */
  undo: Op;
  /** Applying this redoes the step. */
  redo: Op;
  /**
   * Coalescing key: consecutive steps with the same key merge into one
   * entry, so a typing session is a single undo (PLAN §9.13).
   */
  key?: string;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/**
 * Records a new step. Any new step clears the redo stack.
 *
 * Coalescing: if the newest entry has the same `key`, keep its `undo` (which
 * restores the state from *before the first* keystroke) and replace its
 * `redo` with this step (the latest values). This works because `update`
 * ops set absolute values, not deltas.
 */
export function record(history: History, entry: HistoryEntry): History {
  const top = history.past[history.past.length - 1];
  if (entry.key !== undefined && top?.key === entry.key) {
    return { past: [...history.past.slice(0, -1), { ...top, redo: entry.redo }], future: [] };
  }
  // Drop the oldest entries beyond the limit.
  const past = [...history.past, entry].slice(-HISTORY_LIMIT);
  return { past, future: [] };
}
