/**
 * __tests__/helpers/tree.ts: compact tree builders for lib tests.
 *
 * `build` turns a nested outline into a TasksState, so tests read like the
 * tree they describe:
 *
 *   build([
 *     ['work', [['ship'], ['notes', [['draft', { done: true }]]]]],
 *     ['home'],
 *   ])
 *
 * Each node is [id, children?] or [id, fields?] or [id, fields, children].
 * The title equals the id; timestamps default to 0.
 */
import { newTask } from '@/lib/ops';
import { allTasks, findTask } from '@/lib/taskMap';
import { fromDocument, parentKey, toDocument } from '@/lib/tree';
import { type ID, type ParentKey, ROOT, SCHEMA_VERSION, type Task, type TaskFields, type TasksDocument, type TasksState } from '@/lib/types';

export type Node = [ID] | [ID, Node[]] | [ID, Partial<TaskFields>] | [ID, Partial<TaskFields>, Node[]];

/** Builds a TasksState from a nested outline (see file header). */
export function build(nodes: Node[]): TasksState {
  const byId: Record<ID, Task> = {};
  const children: Record<ParentKey, ID[]> = { [ROOT]: [] };
  // Recursion is fine here: test trees are tiny.
  const add = (list: Node[], parentId: ID | null) => {
    const ids: ID[] = [];
    for (const node of list) {
      const [id, a, b] = node;
      const fields = Array.isArray(a) ? {} : (a ?? {});
      const kids = Array.isArray(a) ? a : (b ?? []);
      byId[id] = { ...newTask(id, parentId, id, 0), ...fields };
      ids.push(id);
      add(kids, id);
    }
    if (ids.length) children[parentKey(parentId)] = ids;
  };
  add(nodes, null);
  return fromDocument({ byId, children, structureVersion: 0, schemaVersion: SCHEMA_VERSION });
}

/** The task with this ID (or undefined), for assertions. */
export function tk(state: TasksState, id: ID): Task | undefined {
  return findTask(state, id);
}

/** All task IDs, sorted, for assertions. */
export function ids(state: TasksState): ID[] {
  return allTasks(state)
    .map((t) => t.id)
    .sort();
}

export { allTasks };

/** Renders rows as "  id" lines (two spaces per depth), for readable assertions. */
export function outline(rows: { id: ID; depth: number }[]): string[] {
  return rows.map((r) => `${'  '.repeat(r.depth)}${r.id}`);
}

/**
 * The tree as a flat document without structureVersion, for "undo restores
 * exactly" comparisons (readable diffs, independent of bucket layout).
 */
export function shape(state: TasksState): Omit<TasksDocument, 'structureVersion'> {
  const { structureVersion: _ignored, ...rest } = toDocument(state);
  return rest;
}
