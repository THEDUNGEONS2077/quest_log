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
import { createEmptyState, parentKey } from '@/lib/tree';
import type { ID, TaskFields, TasksState } from '@/lib/types';

export type Node = [ID] | [ID, Node[]] | [ID, Partial<TaskFields>] | [ID, Partial<TaskFields>, Node[]];

/** Builds a TasksState from a nested outline (see file header). */
export function build(nodes: Node[]): TasksState {
  const state = createEmptyState();
  // Recursion is fine here: test trees are tiny.
  const add = (list: Node[], parentId: ID | null) => {
    const ids: ID[] = [];
    for (const node of list) {
      const [id, a, b] = node;
      const fields = Array.isArray(a) ? {} : (a ?? {});
      const kids = Array.isArray(a) ? a : (b ?? []);
      state.byId[id] = { ...newTask(id, parentId, id, 0), ...fields };
      ids.push(id);
      add(kids, id);
    }
    if (ids.length) state.children[parentKey(parentId)] = ids;
  };
  add(nodes, null);
  return state;
}

/** Renders rows as "  id" lines (two spaces per depth), for readable assertions. */
export function outline(rows: { id: ID; depth: number }[]): string[] {
  return rows.map((r) => `${'  '.repeat(r.depth)}${r.id}`);
}

/** State without structureVersion, for "undo restores exactly" comparisons. */
export function shape(state: TasksState): Omit<TasksState, 'structureVersion'> {
  const { structureVersion: _ignored, ...rest } = state;
  return rest;
}
