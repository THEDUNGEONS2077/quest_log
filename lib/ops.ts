/**
 * lib/ops.ts: every change to the task tree, as data (PLAN §6.3, §9.13).
 *
 * Layer: pure lib. ARCHITECTURE.md §5 ("The op pattern").
 *
 * Two levels:
 *   1. Primitive ops (`insert`, `remove`, `move`, `update`, `batch`) are what
 *      `apply` understands. Applying one returns the new state plus its exact
 *      **inverse**, which is what undo applies. Contract (tested):
 *        apply(apply(s, op).state, inverse).state ≡ s   (ignoring structureVersion)
 *   2. Builders (`addTask`, `editTask`, `moveTask`, `indent`, …) turn a user
 *      intent into a primitive op. They also handle bookkeeping such as
 *      bubbling `updatedAt` to ancestors (PLAN §7.1).
 *
 * Purity: no clock, no random IDs, no I/O. Callers pass `at` (the time) and
 * new task objects in, so every op replays identically. That's also what
 * makes external ops (widget, notifications) safe to drain later (§6.4).
 *
 * Immutability: `apply` never mutates its input. It copies only the task
 * buckets and child lists it changes (lib/taskMap.ts), so unchanged tasks
 * keep their object identity and rows subscribed to them don't re-render.
 */
import { findTask, withTasks, withoutTasks } from './taskMap';
import { childIds, getTask, isInSubtree, parentKey, ancestors, liveChildIds, subtreeIds } from './tree';
import { type ID, type ParentKey, type Task, type TaskFields, type TasksState, ROOT } from './types';

// ---------------------------------------------------------------------------
// Op types
// ---------------------------------------------------------------------------

/** Field changes for one task. */
export interface FieldChange {
  id: ID;
  fields: Partial<TaskFields>;
}

export type Op =
  /**
   * Insert a whole subtree. `tasks[0]` is its root, placed at `index` in
   * `parentId`'s child list. `children` holds the child order *inside* the
   * subtree (empty for a single new task).
   */
  | { type: 'insert'; parentId: ID | null; index: number; tasks: Task[]; children: Record<ID, ID[]> }
  /** Hard-remove a task and its whole subtree (soft delete is an `update` of `deletedAt`). */
  | { type: 'remove'; id: ID }
  /** Move a task (with its subtree) to `index` in `parentId`'s list, counted after it's taken out. */
  | { type: 'move'; id: ID; parentId: ID | null; index: number }
  /** Change fields on one or more tasks. */
  | { type: 'update'; changes: FieldChange[] }
  /** Several ops as one undo step (cascade complete, paste, bulk actions). */
  | { type: 'batch'; ops: Op[] };

/** Result of applying an op. */
export interface Applied {
  state: TasksState;
  /** Applying this to `state` restores the previous tree exactly. */
  inverse: Op;
  /** True when rows must be re-derived (structureVersion was bumped). */
  structural: boolean;
}

/**
 * Fields whose change alters which rows are shown or how (done, deleted,
 * collapsed, plus the ones filters and counts use). Title, notes and
 * updatedAt are deliberately *not* structural, so typing never re-flattens
 * the tree (PLAN §6.2). As a consequence, the COMPLETED tab re-sorts by
 * updatedAt on the next structural change or tab switch, not on every
 * keystroke, which also keeps a row from jumping while you edit it.
 */
const STRUCTURAL_FIELDS: ReadonlySet<keyof TaskFields> = new Set<keyof TaskFields>([
  'done',
  'deletedAt',
  'collapsed',
  'priority',
  'dueAt',
  'repeat',
]);

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

/**
 * Applies one op. Pure: returns a new state and never mutates `state`.
 * Throws on invalid ops (unknown IDs, out-of-range index, cycles); those are
 * bugs in the caller, not user errors.
 */
export function apply(state: TasksState, op: Op): Applied {
  const result = applyInner(state, op);
  // structureVersion only ever increases, including on undo, so memoized
  // selectors can't confuse a restored tree with a stale cache entry.
  return result.structural
    ? { ...result, state: { ...result.state, structureVersion: state.structureVersion + 1 } }
    : result;
}

/** Applies an op without touching structureVersion (batch bumps once at the end). */
function applyInner(state: TasksState, op: Op): Applied {
  switch (op.type) {
    case 'insert':
      return applyInsert(state, op);
    case 'remove':
      return applyRemove(state, op.id);
    case 'move':
      return applyMove(state, op);
    case 'update':
      return applyUpdate(state, op.changes);
    case 'batch': {
      // Apply in order; the inverse undoes them in reverse order.
      let current = state;
      let structural = false;
      const inverses: Op[] = [];
      for (const child of op.ops) {
        const r = applyInner(current, child);
        current = r.state;
        structural ||= r.structural;
        inverses.push(r.inverse);
      }
      return { state: current, inverse: { type: 'batch', ops: inverses.reverse() }, structural };
    }
  }
}

/** Inserts a subtree. Inverse: remove its root. */
function applyInsert(state: TasksState, op: Extract<Op, { type: 'insert' }>): Applied {
  const root = op.tasks[0];
  if (!root) throw new Error('ops.insert: no tasks');
  if (root.parentId !== op.parentId) throw new Error('ops.insert: root parentId must match parentId');
  if (op.parentId !== null) getTask(state, op.parentId); // parent must exist
  const siblings = childIds(state, op.parentId);
  if (op.index < 0 || op.index > siblings.length) throw new Error(`ops.insert: index ${op.index} out of range`);

  for (const t of op.tasks) {
    if (findTask(state, t.id)) throw new Error(`ops.insert: task ${t.id} already exists`);
  }
  const buckets = withTasks(state.buckets, op.tasks);
  const children = { ...state.children, ...op.children };
  children[parentKey(op.parentId)] = insertAt(siblings, op.index, root.id);

  return { state: { ...state, buckets, children }, inverse: { type: 'remove', id: root.id }, structural: true };
}

/** Removes a subtree. Inverse: re-insert an exact snapshot at the old position. */
function applyRemove(state: TasksState, id: ID): Applied {
  const root = getTask(state, id);
  const index = childIds(state, root.parentId).indexOf(id);
  const ids = subtreeIds(state, id);

  // Snapshot the subtree (task objects and the child order inside it) for the inverse.
  const tasks = ids.map((i) => getTask(state, i));
  const innerChildren: Record<ID, ID[]> = {};
  for (const i of ids) if (state.children[i]) innerChildren[i] = state.children[i]!;

  const buckets = withoutTasks(state.buckets, ids);
  const children = { ...state.children };
  for (const i of ids) delete children[i];
  setChildList(children, parentKey(root.parentId), removeAt(childIds(state, root.parentId), index));

  return {
    state: { ...state, buckets, children },
    inverse: { type: 'insert', parentId: root.parentId, index, tasks, children: innerChildren },
    structural: true,
  };
}

/** Moves a subtree. Inverse: move back to the old parent and index. */
function applyMove(state: TasksState, op: Extract<Op, { type: 'move' }>): Applied {
  const task = getTask(state, op.id);
  if (op.parentId !== null) {
    getTask(state, op.parentId);
    // A task can't become its own descendant (PLAN §9.15: own subtree is not a target).
    if (isInSubtree(state, op.parentId, op.id)) throw new Error('ops.move: cannot move a task into its own subtree');
  }
  const fromKey = parentKey(task.parentId);
  const fromIndex = childIds(state, task.parentId).indexOf(op.id);

  const children = { ...state.children };
  // Take it out first, so `op.index` counts positions without the moved task.
  setChildList(children, fromKey, removeAt(children[fromKey] ?? [], fromIndex));
  const toKey = parentKey(op.parentId);
  const dest = children[toKey] ?? [];
  if (op.index < 0 || op.index > dest.length) throw new Error(`ops.move: index ${op.index} out of range`);
  children[toKey] = insertAt(dest, op.index, op.id);

  const buckets = withTasks(state.buckets, [{ ...task, parentId: op.parentId }]);
  return {
    state: { ...state, buckets, children },
    inverse: { type: 'move', id: op.id, parentId: task.parentId, index: fromIndex },
    structural: true,
  };
}

/** Changes fields. Inverse: the previous values of exactly those fields. */
function applyUpdate(state: TasksState, changes: FieldChange[]): Applied {
  // Track the latest version of each task, so several changes to one task in
  // a single op build on each other; then write them all in one bucket pass.
  const updated = new Map<ID, Task>();
  const inverse: FieldChange[] = [];
  let structural = false;

  for (const { id, fields } of changes) {
    const current = updated.get(id) ?? getTask(state, id);
    // Record each field's old value before overwriting it.
    const previous: Partial<TaskFields> = {};
    for (const key of Object.keys(fields) as (keyof TaskFields)[]) {
      (previous as Record<string, unknown>)[key] = current[key];
      if (STRUCTURAL_FIELDS.has(key)) structural = true;
    }
    updated.set(id, { ...current, ...fields });
    inverse.push({ id, fields: previous });
  }
  const buckets = withTasks(state.buckets, [...updated.values()]);
  // Undo restores fields in reverse order, so repeated changes to one task unwind correctly.
  return { state: { ...state, buckets }, inverse: { type: 'update', changes: inverse.reverse() }, structural };
}

// ---------------------------------------------------------------------------
// Builders: user intents → ops
// ---------------------------------------------------------------------------

/**
 * `updatedAt` bubbling (PLAN §7.1): changing a task marks it and every
 * ancestor as modified at `at`. That is what moves a completed task to the
 * top of the COMPLETED tab when anything inside it changes.
 */
export function touchChanges(state: TasksState, ids: readonly ID[], at: number): FieldChange[] {
  const seen = new Set<ID>();
  for (const id of ids) {
    if (!findTask(state, id)) continue;
    seen.add(id);
    for (const a of ancestors(state, id)) seen.add(a);
  }
  return [...seen].map((id) => ({ id, fields: { updatedAt: at } }));
}

/** Merges field changes so each task appears once (later fields win). */
export function mergeChanges(changes: readonly FieldChange[]): FieldChange[] {
  const merged = new Map<ID, Partial<TaskFields>>();
  for (const c of changes) merged.set(c.id, { ...merged.get(c.id), ...c.fields });
  return [...merged].map(([id, fields]) => ({ id, fields }));
}

/** A fully populated new task with defaults (title-only, nothing set). */
export function newTask(id: ID, parentId: ID | null, title: string, at: number): Task {
  return {
    id,
    parentId,
    title,
    notes: '',
    done: false,
    doneAt: null,
    priority: 0,
    dueAt: null,
    notify: false,
    notificationIds: [],
    repeat: null,
    repeatSourceId: null,
    collapsed: false,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Adds a new task at `index` under `parentId` (index defaults to the end).
 * Ancestors are touched, and a collapsed parent is expanded so the new task
 * is visible.
 */
export function addTask(state: TasksState, task: Task, index?: number): Op {
  const siblings = childIds(state, task.parentId);
  const insert: Op = {
    type: 'insert',
    parentId: task.parentId,
    index: index ?? siblings.length,
    tasks: [task],
    children: {},
  };
  if (task.parentId === null) return insert;
  return { type: 'batch', ops: [insert, { type: 'update', changes: receiveChildChanges(state, task.parentId, task.createdAt) }] };
}

/**
 * Changes for a parent that just received new children: bubble updatedAt
 * up its ancestor chain, and expand it if collapsed so the new children are
 * visible. Shared by addTask and paste.
 */
export function receiveChildChanges(state: TasksState, parentId: ID, at: number): FieldChange[] {
  const expand: FieldChange[] = getTask(state, parentId).collapsed ? [{ id: parentId, fields: { collapsed: false } }] : [];
  return mergeChanges([...touchChanges(state, [parentId], at), ...expand]);
}

/** Edits fields on one task and bubbles updatedAt to its ancestors. */
export function editTask(state: TasksState, id: ID, fields: Partial<TaskFields>, at: number): Op {
  return { type: 'update', changes: mergeChanges([...touchChanges(state, [id], at), { id, fields }]) };
}

/**
 * Moves a task (with its subtree). `index` is counted in the destination
 * list *without* the task. Both the old and the new ancestors are touched.
 */
export function moveTask(state: TasksState, id: ID, parentId: ID | null, index: number, at: number): Op {
  const oldParent = getTask(state, id).parentId;
  const move: Op = { type: 'move', id, parentId, index };
  // Touch after the move, so the new ancestor chain is the one that bubbles.
  const touched = [id, ...(oldParent ? [oldParent] : [])];
  return { type: 'batch', ops: [move, { type: 'update', changes: touchAfterMove(state, touched, parentId, at) }] };
}

/** touchChanges for the post-move tree: the task, its old parent chain and its new parent chain. */
function touchAfterMove(state: TasksState, ids: ID[], newParent: ID | null, at: number): FieldChange[] {
  const newChain = newParent ? [newParent, ...ancestors(state, newParent)] : [];
  return mergeChanges([...touchChanges(state, ids, at), ...newChain.map((p) => ({ id: p, fields: { updatedAt: at } }))]);
}

/**
 * Indent (⇥ IN): the task becomes the last child of its previous live
 * sibling, which is expanded. Returns null when there is no previous sibling.
 */
export function indent(state: TasksState, id: ID, at: number): Op | null {
  const task = getTask(state, id);
  const siblings = liveChildIds(state, task.parentId);
  const i = siblings.indexOf(id);
  if (i <= 0) return null;
  const newParent = siblings[i - 1]!;
  const move = moveTask(state, id, newParent, childIds(state, newParent).length, at);
  if (!getTask(state, newParent).collapsed) return move;
  return { type: 'batch', ops: [move, { type: 'update', changes: [{ id: newParent, fields: { collapsed: false } }] }] };
}

/**
 * Outdent (⇤ OUT): the task moves out one level and lands right after its
 * former parent. Returns null at top level.
 */
export function outdent(state: TasksState, id: ID, at: number): Op | null {
  const parentId = getTask(state, id).parentId;
  if (parentId === null) return null;
  const grandparent = getTask(state, parentId).parentId;
  const parentIndex = childIds(state, grandparent).indexOf(parentId);
  return moveTask(state, id, grandparent, parentIndex + 1, at);
}

/**
 * Soft delete: the task (and implicitly its subtree) goes to Trash. It keeps
 * its place in `children`, so restore returns it to its exact position
 * (PLAN §9.16).
 */
export function softDelete(state: TasksState, id: ID, at: number): Op {
  return editTask(state, id, { deletedAt: at }, at);
}

/** Restores a soft-deleted task to its original position. */
export function restore(state: TasksState, id: ID, at: number): Op {
  return editTask(state, id, { deletedAt: null }, at);
}

// ---------------------------------------------------------------------------
// Array helpers (copying, never mutating)
// ---------------------------------------------------------------------------

function insertAt(list: readonly ID[], index: number, id: ID): ID[] {
  return [...list.slice(0, index), id, ...list.slice(index)];
}

function removeAt(list: readonly ID[], index: number): ID[] {
  if (index < 0) throw new Error('ops: task missing from its parent list');
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/**
 * Writes a child list, dropping the key when a (non-root) parent has no
 * children left. That keeps "no children" in a single form, so undo
 * round-trips compare equal.
 */
function setChildList(children: Record<ParentKey, ID[]>, key: ParentKey, list: ID[]): void {
  if (list.length === 0 && key !== ROOT) delete children[key];
  else children[key] = list;
}
