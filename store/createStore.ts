/**
 * store/createStore.ts: the app store (Zustand) and its persistence wiring.
 *
 * Layer: store. ARCHITECTURE.md §4 (data flows) and §6 (persistence).
 *
 * One store, four parts:
 *   tasks    the task tree (TasksState); changed only through ops
 *   history  undo/redo (in memory)
 *   ui       tab, zoom, COMPLETED expansions (persisted), editing (not persisted)
 *   settings user settings (persisted)
 *
 * Every task mutation goes through `dispatch(op)`: apply, then record the
 * inverse for undo. Convenience actions (addTask, updateTitle, …) only
 * build ops. Business rules live in lib/ops.ts, not here (PLAN §0).
 *
 * Hydration is synchronous inside createAppStore, so the very first render
 * already has the user's data (PLAN §4: no hydration flash).
 */
import { AppState } from 'react-native';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

import * as ops from '@/lib/ops';
import * as outliner from '@/lib/outliner';
import { parseOutline, pasteOp, TITLE_MAX } from '@/lib/paste';
import { purgeExpiredTrash } from '@/lib/purge';
import { findTask } from '@/lib/taskMap';
import { childIds, getTask, liveChildIds } from '@/lib/tree';
import type { ID, TaskFields, TasksState } from '@/lib/types';

import { EMPTY_HISTORY, type History, record } from './history';
import { KEYS, type KV } from './kv';
import {
  createTasksSaver,
  createThrottledWriter,
  defaultTimers,
  loadJSON,
  loadTasks,
  type LoadResult,
  takeDailySnapshot,
  type Timers,
  type Writer,
} from './persist';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { DEFAULT_UI, type Tab, type UiState } from './uiState';

/** Everything the store needs from the outside world (injected for tests). */
export interface StoreDeps {
  kv: KV;
  /** Current time in epoch ms. */
  now: () => number;
  /** New unique task ID. */
  newId: () => ID;
}

/** Options for dispatch. */
export interface DispatchOptions {
  /** Merge with the previous history entry if it has the same key (typing). */
  coalesceKey?: string;
  /** Record for undo (default true). Purges and migrations pass false. */
  undoable?: boolean;
}

export interface AppStore {
  tasks: TasksState;
  history: History;
  ui: UiState;
  /** The row being edited (PLAN §6.5: at most one). Not persisted. */
  editingId: ID | null;
  /** Where the caret goes when the editor for editingId mounts (null = end). */
  editingCaret: number | null;
  /**
   * Increments whenever editing starts on a row. Part of the typing
   * coalesce key, so each editing session is its own undo step.
   */
  editSession: number;
  settings: Settings;
  /** How the tasks were loaded at startup (for diagnostics and recovery messages). */
  loadStatus: LoadResult['status'];

  // --- Task actions ---
  /** Applies an op and records its inverse for undo. */
  dispatch(op: ops.Op, options?: DispatchOptions): void;
  undo(): boolean;
  redo(): boolean;
  /** Adds a task and returns its new ID. `index` defaults to the end. */
  addTask(parentId: ID | null, title: string, index?: number): ID;
  /** Typing in a title: one undo step per editing session. */
  updateTitle(id: ID, title: string): void;
  /** Typing in notes: one undo step per editing session. */
  updateNotes(id: ID, notes: string): void;
  /** Sets other fields (priority, collapsed, …) as one undoable step. */
  editTask(id: ID, fields: Partial<TaskFields>): void;
  /**
   * Replaces the whole tree (backup import, snapshot restore, dev seed).
   * Clears undo history, because old ops don't apply to a different tree.
   */
  replaceAll(next: TasksState): void;

  // --- Editing (rules in lib/outliner.ts and lib/ops.ts) ---
  /** Backspace on task `id` with nothing to erase: deletes it if empty, and stops editing. */
  backspaceOnEmpty(id: ID): void;
  /** Toolbar → IN: nests the edited task under the task above it. Editing continues. */
  indentTask(id: ID): void;
  /** Toolbar ← OUT: moves the edited task out one level. Editing continues. */
  outdentTask(id: ID): void;
  /** Toolbar + SUB: adds an empty subtask at the end of `id` and starts editing it. */
  addSubtask(id: ID): void;
  /**
   * Text containing line breaks arrived in task `id`'s editor (a paste).
   * The first line becomes this task's title; the rest become tasks below
   * it, nested by indentation. One undo step.
   */
  pasteIntoTask(id: ID, text: string): void;
  /** Quick-add bar: adds a task at the end of the current view (root or zoom). */
  quickAdd(title: string): void;
  /** Quick-add bar paste: every line becomes a task at the end of the current view. */
  quickPaste(text: string): void;
  /**
   * Stops editing task `id` (Enter/Done, toolbar ✓, blur, keyboard closed).
   * An empty task with no children is discarded, as one undo step.
   */
  finishEditing(id: ID): void;
  /** Caret tap: collapse or expand one task. */
  toggleCollapsed(id: ID): void;
  /** Caret long-press: collapse or expand a task and all its siblings at once. */
  setSiblingsCollapsed(id: ID, collapsed: boolean): void;

  // --- UI actions ---
  setTab(tab: Tab): void;
  setZoom(id: ID | null): void;
  /** Starts editing a row (or stops, with null); `caret` = initial caret position (default: end). */
  setEditing(id: ID | null, caret?: number | null): void;
  toggleCompletedExpanded(id: ID): void;

  // --- Settings ---
  updateSettings(patch: Partial<Settings>): void;
}

/**
 * Creates the store: hydrates synchronously from `deps.kv` and runs the
 * launch purges. Call installPersistence afterwards to start saving
 * changes (it also schedules the daily snapshot).
 */
export function createAppStore(deps: StoreDeps) {
  const { kv, now, newId } = deps;

  // --- Hydrate (sync) ---
  const loaded = loadTasks(kv, now());
  let tasks = loaded.state;

  // Launch purge: Trash older than 7 days. Not undoable (it isn't a user action).
  const purge = purgeExpiredTrash(tasks, now());
  if (purge) tasks = ops.apply(tasks, purge).state;

  /** Undo/redo can remove the task being edited; editing then ends instead of pointing at nothing. */
  const stopEditingIfGone = (next: TasksState): Partial<AppStore> => {
    const id = store.getState().editingId;
    return id !== null && !findTask(next, id) ? { editingId: null, editingCaret: null } : {};
  };

  const store = createStore<AppStore>()(
    subscribeWithSelector((set, get) => ({
      tasks,
      history: EMPTY_HISTORY,
      ui: loadJSON(kv, KEYS.ui, DEFAULT_UI),
      editingId: null,
      editingCaret: null,
      editSession: 0,
      settings: loadJSON(kv, KEYS.settings, DEFAULT_SETTINGS),
      loadStatus: loaded.status,

      dispatch(op, options = {}) {
        const { state: next, inverse } = ops.apply(get().tasks, op);
        const history =
          options.undoable === false ? get().history : record(get().history, { undo: inverse, redo: op, key: options.coalesceKey });
        set({ tasks: next, history });
      },

      undo() {
        const { past, future } = get().history;
        const entry = past[past.length - 1];
        if (!entry) return false;
        const result = ops.apply(get().tasks, entry.undo);
        // Store the freshly computed inverse as redo: it reflects the actual tree.
        set({
          tasks: result.state,
          history: { past: past.slice(0, -1), future: [...future, { ...entry, redo: result.inverse }] },
          ...stopEditingIfGone(result.state),
        });
        return true;
      },

      redo() {
        const { past, future } = get().history;
        const entry = future[future.length - 1];
        if (!entry) return false;
        const result = ops.apply(get().tasks, entry.redo);
        // `key` is dropped, so typing after a redo starts a fresh undo step.
        set({
          tasks: result.state,
          history: { past: [...past, { undo: result.inverse, redo: entry.redo }], future: future.slice(0, -1) },
          ...stopEditingIfGone(result.state),
        });
        return true;
      },

      addTask(parentId, title, index) {
        const id = newId();
        get().dispatch(ops.addTask(get().tasks, ops.newTask(id, parentId, title, now()), index));
        return id;
      },

      updateTitle(id, title) {
        get().dispatch(ops.editTask(get().tasks, id, { title }, now()), { coalesceKey: `title:${id}:${get().editSession}` });
      },

      updateNotes(id, notes) {
        get().dispatch(ops.editTask(get().tasks, id, { notes }, now()), { coalesceKey: `notes:${id}:${get().editSession}` });
      },

      editTask(id, fields) {
        get().dispatch(ops.editTask(get().tasks, id, fields, now()));
      },

      backspaceOnEmpty(id) {
        const op = outliner.deleteIfEmpty(get().tasks, id, now());
        if (!op) return; // has children: Backspace never deletes a subtree
        get().dispatch(op);
        get().setEditing(null);
      },

      indentTask(id) {
        const op = ops.indent(get().tasks, id, now());
        if (op) get().dispatch(op);
      },

      outdentTask(id) {
        const op = ops.outdent(get().tasks, id, now());
        if (op) get().dispatch(op);
      },

      addSubtask(id) {
        const child = get().addTask(id, '');
        get().setEditing(child);
      },

      pasteIntoTask(id, text) {
        const [first = '', ...rest] = text.replace(/\r\n?/g, '\n').split('\n');
        const tasks = get().tasks;
        const task = getTask(tasks, id);
        const lines = parseOutline(rest.join('\n'));
        const index = childIds(tasks, task.parentId).indexOf(id) + 1;
        const { op, ids } = pasteOp(tasks, lines, task.parentId, index, now(), newId);
        // Title update + inserted tasks as a single undo step.
        get().dispatch({ type: 'batch', ops: [ops.editTask(tasks, id, { title: first.slice(0, TITLE_MAX) }, now()), op] });
        const last = ids[ids.length - 1];
        if (last) get().setEditing(last, null);
      },

      quickAdd(title) {
        const parent = get().ui.zoomRootId;
        get().addTask(parent, title.slice(0, TITLE_MAX));
      },

      quickPaste(text) {
        const parent = get().ui.zoomRootId;
        const tasks = get().tasks;
        const { op } = pasteOp(tasks, parseOutline(text), parent, childIds(tasks, parent).length, now(), newId);
        get().dispatch(op);
      },

      finishEditing(id) {
        // Another row may already be editing (focus moved): only clear our own session.
        if (get().editingId === id) get().setEditing(null);
        // The task may already be gone (for example, removed by Backspace).
        const task = findTask(get().tasks, id);
        // An empty task with no children left behind on blur is discarded
        // (undoable, so history stays consistent).
        if (task && task.title === '' && liveChildIds(get().tasks, id).length === 0) {
          get().dispatch({ type: 'remove', id });
        }
      },

      toggleCollapsed(id) {
        const task = getTask(get().tasks, id);
        get().editTask(id, { collapsed: !task.collapsed });
      },

      setSiblingsCollapsed(id, collapsed) {
        const tasks = get().tasks;
        const siblings = childIds(tasks, getTask(tasks, id).parentId);
        // Only siblings that have children can collapse.
        const changes = siblings.filter((s) => (tasks.children[s]?.length ?? 0) > 0).map((s) => ({ id: s, fields: { collapsed } }));
        if (changes.length) get().dispatch({ type: 'update', changes });
      },

      replaceAll(next) {
        // Keep structureVersion increasing, so memoized rows can't be stale.
        const structureVersion = Math.max(next.structureVersion, get().tasks.structureVersion) + 1;
        set({ tasks: { ...next, structureVersion }, history: EMPTY_HISTORY, ui: { ...get().ui, zoomRootId: null } });
      },

      setTab: (tab) => set({ ui: { ...get().ui, tab } }),
      setZoom: (zoomRootId) => set({ ui: { ...get().ui, zoomRootId } }),
      setEditing: (editingId, caret = null) =>
        // A new editing session starts a new undo step for typing.
        set({
          editingId,
          editingCaret: caret,
          editSession: editingId === get().editingId ? get().editSession : get().editSession + 1,
        }),
      toggleCompletedExpanded(id) {
        const list = get().ui.completedExpanded;
        const completedExpanded = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
        set({ ui: { ...get().ui, completedExpanded } });
      },

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
    })),
  );

  return Object.assign(store, {
    /** False when saved data is from a newer app version (never overwrite it). */
    writable: loaded.writable,
    /**
     * What's on disk right now, for the incremental saver. null = the disk
     * layout doesn't match memory (recovered, migrated or repaired), so the
     * first save must be a full rewrite.
     */
    onDisk: loaded.status === 'loaded' || loaded.status === 'fresh' ? loaded.state : null,
    /** The launch purge changed the tree, so it must be saved. */
    dirtyAtStart: purge !== null,
    /** Only cleanly loaded data becomes a daily snapshot. */
    snapshotEligible: loaded.writable && (loaded.status === 'loaded' || loaded.status === 'migrated' || loaded.status === 'repaired'),
    now,
  });
}

export type AppStoreInstance = ReturnType<typeof createAppStore>;

/**
 * Starts saving the store to `kv`:
 *   - tasks, ui and settings each get a throttled writer (300 ms),
 *   - everything is flushed when the app leaves the foreground.
 * Returns a function that stops persistence and flushes pending writes.
 *
 * When loaded data was from a newer app version (writable = false), tasks
 * are never written, so the newer data can't be overwritten.
 */
export interface PersistenceOptions {
  /** Flush on AppState changes (default true; tests turn it off). */
  listenAppState?: boolean;
  /** Delay before the daily snapshot, so it stays off the startup path. */
  snapshotDelayMs?: number;
  timers?: Timers;
}

export function installPersistence(store: AppStoreInstance, kv: KV, opts: PersistenceOptions = {}): () => void {
  const timers = opts.timers ?? defaultTimers;
  const writers: Writer[] = [];
  const unsubs: (() => void)[] = [];

  // Wire one slice to one key: changes mark the writer dirty, and the writer
  // serializes the latest value when its throttle window ends.
  const wire = <T,>(select: (s: AppStore) => T, write: (value: T) => void) => {
    const writer = createThrottledWriter(() => write(select(store.getState())), undefined, timers);
    writers.push(writer);
    unsubs.push(store.subscribe(select, () => writer.markDirty()));
    return writer;
  };

  if (store.writable) {
    // Incremental: only changed buckets are re-serialized (store/persist.ts).
    const saveTasks = createTasksSaver(kv, store.onDisk);
    const tasksWriter = wire((s) => s.tasks, saveTasks);
    // Bring the disk up to date if memory already differs from it at startup.
    if (store.onDisk === null || store.dirtyAtStart) tasksWriter.markDirty();
  }
  wire((s) => s.ui, (ui) => kv.set(KEYS.ui, JSON.stringify(ui)));
  wire((s) => s.settings, (st) => kv.set(KEYS.settings, JSON.stringify(st)));

  const flushAll = () => writers.forEach((w) => w.flush());

  // Daily snapshot a few seconds after launch: it serializes the whole tree,
  // which shouldn't delay the first frame (PLAN §5 cold start budget).
  let snapshotTimer: unknown = null;
  if (store.snapshotEligible) {
    snapshotTimer = timers.setTimeout(() => {
      snapshotTimer = null;
      takeDailySnapshot(kv, store.getState().tasks, store.now());
    }, opts.snapshotDelayMs ?? 3000);
  }

  // Going to background: write now. Android may kill a background app
  // without warning, and pending writes would be lost (PLAN §7.3).
  if (opts.listenAppState !== false) {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushAll();
    });
    unsubs.push(() => sub.remove());
  }

  return () => {
    if (snapshotTimer !== null) timers.clearTimeout(snapshotTimer);
    flushAll();
    unsubs.forEach((u) => u());
  };
}
