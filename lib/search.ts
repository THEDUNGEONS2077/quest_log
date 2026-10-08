/**
 * lib/search.ts: search and filter chips (PLAN §9.11).
 *
 * Layer: pure lib.
 *   - Search is case- and accent-insensitive ("cafe" finds "Café") over titles
 *     and notes.
 *   - Filters (ACTIVE tab): ALL · !!! (high priority) · DUE · OVERDUE · ↻.
 *   - Results keep the tree shape: each match is shown with its ancestors,
 *     and an ancestor that doesn't match itself is marked `context` (drawn
 *     dimmed). Collapsed groups are opened in results, since a match hidden
 *     inside one would be useless.
 */
import type { Row } from './flatten';
import { findTask } from './taskMap';
import { childIds } from './tree';
import { ROOT, type ID, type Task, type TasksState } from './types';

/** The filter chips on the ACTIVE tab. */
export type Filter = 'all' | 'high' | 'due' | 'overdue' | 'repeat';

/** A row in search/filter results. */
export interface FoundRow extends Row {
  /** Shown only because a descendant matches (drawn dimmed). */
  context: boolean;
}

/** Lowercase without accents, for comparisons ("Café" → "cafe"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Builds the predicate for a query and filter; null when both are empty (no search). */
export function matcher(query: string, filter: Filter, now: number): ((t: Task) => boolean) | null {
  const q = normalize(query.trim());
  if (!q && filter === 'all') return null;
  return (t) => {
    if (q && !normalize(t.title).includes(q) && !normalize(t.notes).includes(q)) return false;
    switch (filter) {
      case 'all':
        return true;
      case 'high':
        return t.priority === 3;
      case 'due':
        return t.dueAt !== null;
      case 'overdue':
        return t.dueAt !== null && !t.done && t.dueAt < now;
      case 'repeat':
        return t.repeat !== null;
    }
  };
}

/**
 * Search results for the ACTIVE tab: matching tasks plus their ancestors,
 * in tree order, under `rootId` (zoom). Done top-level tasks are excluded
 * (they're on COMPLETED), as are deleted ones.
 */
export function searchActive(state: TasksState, matches: (t: Task) => boolean, rootId: ID | null = null): FoundRow[] {
  const rows: FoundRow[] = [];
  // Returns true if `id` or anything below it matches; appends rows in order.
  const visit = (id: ID, depth: number): boolean => {
    const t = findTask(state, id);
    if (!t || t.deletedAt !== null) return false;
    if (rootId === null && depth === 0 && t.done) return false;
    const self = matches(t);
    const at = rows.length;
    let below = false;
    for (const c of childIds(state, id)) below = visit(c, depth + 1) || below;
    if (!self && !below) return false;
    const kids = childIds(state, id).filter((c) => findTask(state, c)?.deletedAt === null);
    const done = kids.filter((c) => findTask(state, c)!.done).length;
    rows.splice(at, 0, { id, depth, hasChildren: kids.length > 0, progress: { done, total: kids.length }, context: !self });
    return true;
  };
  for (const id of childIds(state, rootId)) visit(id, 0);
  return rows;
}

/**
 * Search results for the COMPLETED tab: done top-level tasks whose subtree
 * matches, newest first, each with its matching descendants (and their
 * ancestors) shown.
 */
export function searchCompleted(state: TasksState, matches: (t: Task) => boolean): FoundRow[] {
  const tops = (state.children[ROOT] ?? [])
    .map((id) => findTask(state, id))
    .filter((t): t is Task => !!t && t.done && t.deletedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const out: FoundRow[] = [];
  for (const top of tops) {
    // Reuse the ACTIVE walk on this one subtree (as its own root), then shift depths.
    const inner = searchActive(state, matches, top.id).map((r) => ({ ...r, depth: r.depth + 1 }));
    const self = matches(top);
    if (!self && !inner.length) continue;
    const kids = childIds(state, top.id).filter((c) => findTask(state, c)?.deletedAt === null);
    const done = kids.filter((c) => findTask(state, c)!.done).length;
    out.push({ id: top.id, depth: 0, hasChildren: kids.length > 0, progress: { done, total: kids.length }, context: !self }, ...inner);
  }
  return out;
}

/** Where `query` occurs in `text` (accent/case-insensitive), for highlighting; null if absent. */
export function matchRange(text: string, query: string): { start: number; end: number } | null {
  const q = normalize(query.trim());
  if (!q) return null;
  // normalize() can change string length (decomposed accents), so search on a
  // per-character normalized copy that keeps the original indices.
  const chars = [...text].map((c) => normalize(c));
  for (let i = 0; i < chars.length; i++) {
    let j = i;
    let k = 0;
    while (j < chars.length && k < q.length && q.startsWith(chars[j]!, k)) {
      k += chars[j]!.length;
      j++;
    }
    if (k >= q.length && chars[i]!.length > 0) return { start: i, end: j };
  }
  return null;
}
