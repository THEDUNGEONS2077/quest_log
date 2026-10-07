/**
 * lib/tree.ts: read-only queries over the normalized task tree.
 *
 * Layer: pure lib. Nothing here mutates state. These helpers are shared by
 * ops.ts (which builds changes), flatten.ts (which builds rows) and the
 * store's selectors.
 */
import { bucketsFromRecord, emptyBuckets, findTask, recordFromBuckets } from './taskMap';
import { type ID, type ParentKey, ROOT, type Task, type TasksDocument, type TasksState, SCHEMA_VERSION } from './types';

/** An empty tree: no tasks, ROOT present with no children. */
export function createEmptyState(): TasksState {
  return { buckets: emptyBuckets(), children: { [ROOT]: [] }, structureVersion: 0, schemaVersion: SCHEMA_VERSION };
}

/** The tree as one flat document (snapshots, backup, migrations). */
export function toDocument(state: TasksState): TasksDocument {
  return {
    byId: recordFromBuckets(state.buckets),
    children: state.children,
    structureVersion: state.structureVersion,
    schemaVersion: state.schemaVersion,
  };
}

/** The in-memory tree from a flat document. */
export function fromDocument(doc: TasksDocument): TasksState {
  return {
    buckets: bucketsFromRecord(doc.byId),
    children: doc.children,
    structureVersion: doc.structureVersion,
    schemaVersion: doc.schemaVersion,
  };
}

/** The `children` key for a parent: its ID, or ROOT for top level. */
export function parentKey(parentId: ID | null): ParentKey {
  return parentId ?? ROOT;
}

/** Ordered child IDs of a parent (empty array if none). Includes deleted children. */
export function childIds(state: TasksState, parentId: ID | null): readonly ID[] {
  return state.children[parentKey(parentId)] ?? [];
}

/** Looks up a task, throwing if it doesn't exist (a bug in the caller). */
export function getTask(state: TasksState, id: ID): Task {
  const task = findTask(state, id);
  if (!task) throw new Error(`tree: unknown task ${id}`);
  return task;
}

/** Position of a task within its parent's child list. */
export function indexInParent(state: TasksState, id: ID): number {
  const task = getTask(state, id);
  const index = childIds(state, task.parentId).indexOf(id);
  if (index < 0) throw new Error(`tree: ${id} missing from its parent's children`);
  return index;
}

/** Ancestors of a task, nearest first (parent, grandparent, …). Excludes the task itself. */
export function ancestors(state: TasksState, id: ID): ID[] {
  const out: ID[] = [];
  let parent = getTask(state, id).parentId;
  while (parent !== null) {
    out.push(parent);
    parent = getTask(state, parent).parentId;
  }
  return out;
}

/** The top-level task a task belongs to (itself if it is top level). */
export function topLevelOf(state: TasksState, id: ID): ID {
  const chain = ancestors(state, id);
  return chain.length ? chain[chain.length - 1]! : id;
}

/** Depth below top level: 0 for top-level tasks. */
export function depthOf(state: TasksState, id: ID): number {
  return ancestors(state, id).length;
}

/** True when `id` is `ancestorId` or anywhere inside its subtree. */
export function isInSubtree(state: TasksState, id: ID, ancestorId: ID): boolean {
  return id === ancestorId || ancestors(state, id).includes(ancestorId);
}

/**
 * All task IDs in a subtree, the root first, then depth-first in display
 * order. Includes soft-deleted descendants (they move and restore with
 * their parent).
 */
export function subtreeIds(state: TasksState, rootId: ID): ID[] {
  const out: ID[] = [];
  // Iterative DFS with an explicit stack, so very deep trees can't overflow
  // the call stack. Children are pushed in reverse so they pop in order.
  const stack: ID[] = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    const kids = state.children[id];
    if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
  return out;
}

/** Child IDs that aren't soft-deleted. */
export function liveChildIds(state: TasksState, parentId: ID | null): ID[] {
  return childIds(state, parentId).filter((c) => findTask(state, c)?.deletedAt === null);
}

/** The previous live sibling of a task, or null if it is the first. */
export function previousLiveSibling(state: TasksState, id: ID): ID | null {
  const siblings = liveChildIds(state, getTask(state, id).parentId);
  const i = siblings.indexOf(id);
  return i > 0 ? siblings[i - 1]! : null;
}
