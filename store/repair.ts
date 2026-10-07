/**
 * store/repair.ts: makes a loaded task document consistent again.
 *
 * Layer: store. Tasks are saved as several MMKV keys (one per bucket plus a
 * `meta` key with the child lists). If the app is killed between two of
 * those writes, the saved data can be slightly inconsistent: a list can
 * name a task that wasn't saved, or a new task can be missing from every
 * list. Instead of discarding the data, repair fixes it with the smallest
 * change that keeps every task:
 *
 *   - list entries for missing tasks are dropped,
 *   - a task listed twice keeps its first position,
 *   - a task's parentId is corrected to the list it's in,
 *   - a task in no list is appended to its parent (or top level),
 *   - anything unreachable from the root (a cycle) moves to top level.
 */
import { type ID, type ParentKey, ROOT, type TasksDocument } from '@/lib/types';

/** Returns a consistent copy of `doc` and whether anything had to change. */
export function repairDocument(doc: TasksDocument): { doc: TasksDocument; repaired: boolean } {
  const byId = { ...doc.byId };
  const children: Record<ParentKey, ID[]> = {};
  let repaired = false;
  const listed = new Set<ID>();

  // 1. Clean every list: drop missing and duplicate IDs; fix parentIds.
  for (const [key, list] of Object.entries(doc.children)) {
    if (key !== ROOT && !byId[key]) {
      repaired = true; // a list for a parent that no longer exists
      continue;
    }
    const clean: ID[] = [];
    for (const id of list) {
      const task = byId[id];
      if (!task || listed.has(id)) {
        repaired = true;
        continue;
      }
      const parentId = key === ROOT ? null : key;
      if (task.parentId !== parentId) {
        byId[id] = { ...task, parentId };
        repaired = true;
      }
      listed.add(id);
      clean.push(id);
    }
    if (clean.length || key === ROOT) children[key] = clean;
  }
  children[ROOT] ??= [];

  // 2. Re-attach tasks that are in no list: under their parent if it exists, else top level.
  for (const task of Object.values(byId)) {
    if (listed.has(task.id)) continue;
    repaired = true;
    const parentOk = task.parentId !== null && byId[task.parentId] !== undefined;
    const key = parentOk ? task.parentId! : ROOT;
    if (!parentOk) byId[task.id] = { ...task, parentId: null };
    (children[key] ??= []).push(task.id);
    listed.add(task.id);
  }

  // 3. Anything not reachable from the root is in a parent cycle: move it to top level.
  const reachable = new Set<ID>();
  const stack = [...children[ROOT]];
  while (stack.length) {
    const id = stack.pop()!;
    reachable.add(id);
    for (const c of children[id] ?? []) stack.push(c);
  }
  for (const id of Object.keys(byId)) {
    if (reachable.has(id)) continue;
    repaired = true;
    const old = byId[id]!.parentId ?? ROOT;
    const remaining = (children[old] ?? []).filter((x) => x !== id);
    if (remaining.length || old === ROOT) children[old] = remaining;
    else delete children[old];
    byId[id] = { ...byId[id]!, parentId: null };
    children[ROOT].push(id);
    // Its subtree becomes reachable through it.
    const sub = [id];
    while (sub.length) {
      const s = sub.pop()!;
      reachable.add(s);
      for (const c of children[s] ?? []) sub.push(c);
    }
  }

  return { doc: repaired ? { ...doc, byId, children } : doc, repaired };
}
