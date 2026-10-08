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

import * as complete from '@/lib/complete';
import { formatDue } from '@/lib/dates';
import * as copy from '@/lib/copy';
import * as dnd from '@/lib/dnd';
import * as ops from '@/lib/ops';
import * as outliner from '@/lib/outliner';
import { parse, type ParseResult } from '@/lib/parser';
import { firstOccurrence } from '@/lib/recurrence';
import { parseOutline, pasteOp, TITLE_MAX } from '@/lib/paste';
import { purgeExpiredTrash } from '@/lib/purge';
import { findTask } from '@/lib/taskMap';
import { ancestors, childIds, getTask, liveChildIds } from '@/lib/tree';
import type { ID, Priority, RepeatRule, TaskFields, TasksState } from '@/lib/types';

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

/** A short message at the bottom of the screen, optionally with UNDO (PLAN §9.13). */
export interface Toast {
  /** Unique per toast, so a new toast restarts the timer even with the same text. */
  key: number;
  message: string;
  /** Show an UNDO button that undoes the most recent step. */
  undo: boolean;
}

/** What a checkbox tap did, so the UI can pick the haptic (PLAN §9.18). */
export type ToggleOutcome = 'checked' | 'unchecked' | 'parent-completed' | 'moved-to-completed' | 'repeated';

/** How long a repeating task shows its strike before un-striking with the new date (PLAN §10.5). */
export const ADVANCE_MS = 500;

/** How long a just-checked top-level task stays on ACTIVE: strike (200 ms) + hold (500 ms). */
export const LINGER_MS = 700;

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
  /** Which field of the row is being edited (PLAN §6.5: title, or the notes under it). */
  editingField: 'title' | 'notes';
  /**
   * The title when this editing session started. Shorthand is applied on
   * finish only if the title changed, so an escaped literal like "\@5pm"
   * (stored as "@5pm") isn't re-parsed every time the task is edited.
   */
  editingStartTitle: string | null;
  /** Rows whose notes are expanded in view mode (tap ≡). Not persisted. */
  expandedNotes: ID[];
  /** Quick-add target after `#Group`: new tasks go inside it until cleared. Not persisted. */
  quickAddParent: ID | null;
  /** The task whose due-date sheet is open (PLAN §9.8), or null. Not persisted. */
  dueSheetFor: ID | null;
  /** The task whose repeat sheet is open (PLAN §9.9), or null. Not persisted. */
  repeatSheetFor: ID | null;
  /** A task to scroll to and flash (opened from a notification or link). Not persisted. */
  highlightId: ID | null;
  /** The task being dragged (PLAN §9.10), or null. Not persisted. */
  draggingId: ID | null;
  /** The task whose long-press menu is open, or null. Not persisted. */
  menuFor: ID | null;
  /**
   * Increments whenever editing starts on a row. Part of the typing
   * coalesce key, so each editing session is its own undo step.
   */
  editSession: number;
  settings: Settings;
  /**
   * Just-checked top-level tasks still shown on ACTIVE while their
   * strikethrough plays and holds (PLAN §6.6). Not persisted.
   */
  lingering: ID[];
  /**
   * Repeating tasks just checked: their strike plays and holds, then
   * un-strikes with the new date (PLAN §10.5). Not persisted.
   */
  advancing: ID[];
  /** The toast on screen, if any. Not persisted. */
  toast: Toast | null;
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

  // --- Completion (rules in lib/complete.ts) ---
  /** Checkbox tap or swipe right: checks or unchecks, with cascade and auto-complete. */
  toggleDone(id: ID): ToggleOutcome;
  /** The lingering animation for a completed top-level task is over: let it leave ACTIVE. */
  releaseLingering(id: ID): void;
  /** The repeat animation for task `id` is over. */
  releaseAdvancing(id: ID): void;
  /** COMPLETED → swipe right / Restore: unchecks the task and its subtree; it returns to its place. */
  restoreTask(id: ID): void;
  /** COMPLETED → Run again: a fresh unchecked copy at the end of ACTIVE. */
  runAgain(id: ID): void;
  /** COMPLETED → Clear…: moves completed tasks (older than N days, or all) to Trash. */
  clearCompleted(olderThanDays: number | null): void;
  /** Swipe left: moves a task to Trash, with an undo toast. */
  deleteTask(id: ID): void;

  // --- Toasts ---
  showToast(message: string, undo?: boolean): void;
  /** Hides the toast, only if it's still the one with this key. */
  dismissToast(key: number): void;

  // --- UI actions ---
  setTab(tab: Tab): void;
  setZoom(id: ID | null): void;
  /** Starts editing a row (or stops, with null); `caret` = initial caret position (default: end). */
  setEditing(id: ID | null, caret?: number | null, field?: 'title' | 'notes'): void;
  /** Shows or hides a row's notes in view mode. */
  toggleNotes(id: ID): void;

  // --- Details (Phase 6) ---
  /** Toolbar ! PRI: none → ! → !! → !!! → none. */
  cyclePriority(id: ID): void;
  setPriority(id: ID, priority: Priority): void;
  /** Clears the due date (and its notification flag). */
  clearDue(id: ID): void;
  /** Context menu ⊞ Duplicate: a copy right below the original. */
  duplicateTask(id: ID): void;
  /** Context menu ⎕ Copy as text: the task's outline text (the UI puts it on the clipboard). */
  outlineText(id: ID): string;
  /**
   * Parses shorthand with the user's settings (default time) at the current
   * time. Words in `literal` are kept as typed (the saved title's words).
   */
  parseShorthand(text: string, literal?: ReadonlySet<string>): ParseResult;
  /** Stops targeting a `#Group` with the quick-add bar. */
  clearQuickAddParent(): void;

  // --- Due dates and reminders (Phase 7) ---
  openDueSheet(id: ID): void;
  openRepeatSheet(id: ID): void;
  closeRepeatSheet(): void;
  /**
   * Sets (or with null, stops) a task's repeat rule. A rule needs a due
   * date: without one, the first occurrence at the default time is used
   * (PLAN §9.9). "Stop repeating" keeps the date.
   */
  setRepeat(id: ID, rule: RepeatRule | null): void;
  closeDueSheet(): void;
  /** Sets (or with null, clears) a due date and whether it sends a notification. One undo step. */
  setDue(id: ID, dueAt: number | null, notify: boolean): void;
  /**
   * Shows a task (from a notification tap or a questlog://task/<id> link):
   * picks its tab, expands collapsed ancestors, leaves zoom, and marks it
   * to be scrolled to and flashed.
   */
  revealTask(id: ID): void;
  clearHighlight(): void;

  // --- Drag-and-drop and its accessible alternatives (Phase 9) ---
  setDragging(id: ID | null): void;
  openMenu(id: ID): void;
  closeMenu(): void;
  /** Accessibility "Move up" / "Move down": swap with the neighbouring sibling. */
  moveTaskBy(id: ID, delta: -1 | 1): void;
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

  /** Task fields from parsed shorthand; a due date turns on its notification per the setting. */
  const shorthandFields = (r: ParseResult, existingDue: number | null = null): Partial<TaskFields> => {
    const { notifyByDefault, defaultTimeMinutes } = store.getState().settings;
    const fields: Partial<TaskFields> = {
      ...(r.priority !== undefined && { priority: r.priority }),
      ...(r.dueAt !== undefined && { dueAt: r.dueAt, notify: notifyByDefault }),
      ...(r.notes !== undefined && { notes: r.notes }),
    };
    if (r.repeat) {
      // A repeat needs a date: typed, existing, or the first occurrence at the default time.
      const dueAt = r.dueAt ?? existingDue ?? firstOccurrence(r.repeat, now(), defaultTimeMinutes);
      fields.repeat =
        r.repeat.freq === 'month' || r.repeat.freq === 'year' ? { ...r.repeat, monthDay: new Date(dueAt).getDate() } : r.repeat;
      if (fields.dueAt === undefined && existingDue === null) Object.assign(fields, { dueAt, notify: notifyByDefault });
    }
    return fields;
  };

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
      editingField: 'title',
      editingStartTitle: null,
      expandedNotes: [],
      quickAddParent: null,
      dueSheetFor: null,
      repeatSheetFor: null,
      highlightId: null,
      draggingId: null,
      menuFor: null,
      editSession: 0,
      settings: loadJSON(kv, KEYS.settings, DEFAULT_SETTINGS),
      lingering: [],
      advancing: [],
      toast: null,
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

      quickAdd(text) {
        const r = get().parseShorthand(text);
        if (!r.title && !r.group) return; // only tokens, no title: nothing to add
        // The `#Group` target may have been deleted or undone since: then fall back to the view.
        const target = get().quickAddParent;
        const targetOk = target !== null && findTask(get().tasks, target)?.deletedAt === null;
        if (target !== null && !targetOk) set({ quickAddParent: null });
        const parent = targetOk ? target : get().ui.zoomRootId;
        const id = newId();
        const task = { ...ops.newTask(id, parent, r.title.slice(0, TITLE_MAX), now()), ...shorthandFields(r) };
        get().dispatch(ops.addTask(get().tasks, task));
        // `#Group`: the next quick-adds go inside it (PLAN §9.4 "ready for children").
        if (r.group) set({ quickAddParent: id });
      },

      quickPaste(text) {
        const parent = get().ui.zoomRootId;
        const tasks = get().tasks;
        const { op } = pasteOp(tasks, parseOutline(text), parent, childIds(tasks, parent).length, now(), newId);
        get().dispatch(op);
      },

      finishEditing(id) {
        const startTitle = get().editingId === id ? get().editingStartTitle : null;
        // Another row may already be editing (focus moved): only clear our own session.
        if (get().editingId === id) get().setEditing(null);
        // The task may already be gone (for example, removed by Backspace).
        let task = findTask(get().tasks, id);
        // Shorthand typed during this session (!!, @fri, //…) becomes fields: one undo step.
        if (task && startTitle !== null && task.title !== startTitle) {
          // Only newly typed words count as shorthand: the saved title's words stay literal.
          const r = get().parseShorthand(task.title, new Set(startTitle.split(/\s+/).filter(Boolean)));
          if (r.chips.length) {
            // Typing only shorthand ("!!") must not empty the title (which would delete the task).
            const fields = { ...shorthandFields(r, task.dueAt), title: r.title || startTitle };
            // `//` appends to existing notes rather than replacing them.
            if (r.notes !== undefined && task.notes) fields.notes = `${task.notes}\n${r.notes}`;
            get().dispatch(ops.editTask(get().tasks, id, fields, now()));
            task = findTask(get().tasks, id);
          }
        }
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

      toggleDone(id) {
        const tasks = get().tasks;
        const task = getTask(tasks, id);
        if (task.done) {
          get().dispatch(complete.uncheck(tasks, id, now()));
          return 'unchecked';
        }
        const r = complete.check(tasks, id, now());
        get().dispatch(r.op);
        if (r.advanced) {
          // Repeat: strike, hold, then un-strike with the new date chip.
          set({ advancing: [...get().advancing, r.advanced.id] });
          get().showToast(`NEXT: ${formatDue(r.advanced.nextDue, now())}`, true);
          return 'repeated';
        }
        if (r.completedTopLevel) {
          // Keep it visible while the strike plays; TaskRow releases it after LINGER_MS.
          set({ lingering: [...get().lingering, r.completedTopLevel] });
          get().showToast(r.completedTopLevel === id ? 'COMPLETED' : 'COMPLETED · GROUP DONE', true);
          return 'moved-to-completed';
        }
        return r.autoCompleted.length ? 'parent-completed' : 'checked';
      },

      releaseAdvancing(id) {
        if (get().advancing.includes(id)) set({ advancing: get().advancing.filter((x) => x !== id) });
      },

      releaseLingering(id) {
        if (get().lingering.includes(id)) set({ lingering: get().lingering.filter((x) => x !== id) });
      },

      restoreTask(id) {
        get().dispatch(complete.uncheck(get().tasks, id, now(), { subtree: true }));
        get().showToast('RESTORED', true);
      },

      runAgain(id) {
        const { op } = complete.runAgain(get().tasks, id, now(), newId);
        get().dispatch(op);
        get().showToast('ADDED TO ACTIVE', true);
      },

      clearCompleted(olderThanDays) {
        const r = complete.clearCompleted(get().tasks, now(), olderThanDays);
        if (!r) {
          get().showToast('NOTHING TO CLEAR', false);
          return;
        }
        get().dispatch(r.op);
        get().showToast(`CLEARED ${r.count}`, true);
      },

      deleteTask(id) {
        if (get().editingId === id) get().setEditing(null);
        get().dispatch(ops.softDelete(get().tasks, id, now()));
        get().showToast('DELETED', true);
      },

      showToast(message, undo = false) {
        set({ toast: { key: (get().toast?.key ?? 0) + 1, message, undo } });
      },

      dismissToast(key) {
        if (get().toast?.key === key) set({ toast: null });
      },

      replaceAll(next) {
        // Keep structureVersion increasing, so memoized rows can't be stale.
        const structureVersion = Math.max(next.structureVersion, get().tasks.structureVersion) + 1;
        set({ tasks: { ...next, structureVersion }, history: EMPTY_HISTORY, ui: { ...get().ui, zoomRootId: null } });
      },

      setTab: (tab) => set({ ui: { ...get().ui, tab } }),
      setZoom: (zoomRootId) => set({ ui: { ...get().ui, zoomRootId } }),
      setEditing: (editingId, caret = null, field = 'title') =>
        // A new editing session starts a new undo step for typing.
        set({
          editingId,
          editingCaret: caret,
          editingField: field,
          // Switching title ↔ notes on the same row keeps the session's start title.
          editingStartTitle:
            editingId === null
              ? null
              : editingId === get().editingId
                ? get().editingStartTitle
                : (findTask(get().tasks, editingId)?.title ?? null),
          editSession: editingId === get().editingId ? get().editSession : get().editSession + 1,
        }),

      toggleNotes(id) {
        const list = get().expandedNotes;
        set({ expandedNotes: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
      },

      cyclePriority(id) {
        const p = getTask(get().tasks, id).priority;
        get().editTask(id, { priority: ((p + 1) % 4) as Priority });
      },

      setPriority(id, priority) {
        if (getTask(get().tasks, id).priority !== priority) get().editTask(id, { priority });
      },

      clearDue(id) {
        get().editTask(id, { dueAt: null, notify: false });
      },

      duplicateTask(id) {
        const { op } = copy.duplicate(get().tasks, id, now(), newId);
        get().dispatch(op);
        get().showToast('DUPLICATED', true);
      },

      outlineText: (id) => copy.toOutlineText(get().tasks, id),

      parseShorthand: (text, literal) => parse(text, { now: now(), defaultTimeMinutes: get().settings.defaultTimeMinutes, literal }),

      clearQuickAddParent: () => set({ quickAddParent: null }),

      openDueSheet: (id) => set({ dueSheetFor: id }),
      openRepeatSheet: (id) => set({ repeatSheetFor: id }),
      closeRepeatSheet: () => set({ repeatSheetFor: null }),

      setRepeat(id, rule) {
        const task = getTask(get().tasks, id);
        if (rule === null) {
          if (task.repeat !== null) get().editTask(id, { repeat: null });
          return;
        }
        // A repeat needs a date: start at the first occurrence if there isn't one.
        const dueAt = task.dueAt ?? firstOccurrence(rule, now(), get().settings.defaultTimeMinutes);
        const anchored = rule.freq === 'month' || rule.freq === 'year' ? { ...rule, monthDay: new Date(dueAt).getDate() } : rule;
        get().editTask(id, {
          repeat: anchored,
          dueAt,
          ...(task.dueAt === null && { notify: get().settings.notifyByDefault }),
        });
      },
      closeDueSheet: () => set({ dueSheetFor: null }),

      setDue(id, dueAt, notify) {
        const t = getTask(get().tasks, id);
        if (t.dueAt === dueAt && t.notify === notify) return;
        get().editTask(id, { dueAt, notify: dueAt === null ? false : notify });
      },

      revealTask(id) {
        const tasks = get().tasks;
        const task = findTask(tasks, id);
        if (!task || task.deletedAt !== null) return;
        const chain = ancestors(tasks, id); // nearest first
        const top = chain.length ? chain[chain.length - 1]! : id;
        if (getTask(tasks, top).done) {
          // On COMPLETED: expand the completed ancestors (the tab's own expanded set).
          const expanded = new Set([...get().ui.completedExpanded, ...chain]);
          set({ ui: { ...get().ui, tab: 'completed', completedExpanded: [...expanded] }, highlightId: id });
          return;
        }
        // On ACTIVE: expand collapsed ancestors. Not an undo step (it's navigation).
        const collapsed = chain.filter((a) => getTask(tasks, a).collapsed);
        if (collapsed.length) {
          get().dispatch({ type: 'update', changes: collapsed.map((a) => ({ id: a, fields: { collapsed: false } })) }, { undoable: false });
        }
        set({ ui: { ...get().ui, tab: 'active', zoomRootId: null }, highlightId: id });
      },

      clearHighlight: () => set({ highlightId: null }),

      setDragging: (draggingId) => set({ draggingId }),
      openMenu: (menuFor) => set({ menuFor }),
      closeMenu: () => set({ menuFor: null }),

      moveTaskBy(id, delta) {
        const tasks = get().tasks;
        const op = dnd.moveBy(tasks, id, delta, now(), (x) => findTask(tasks, x)?.deletedAt === null);
        if (op) get().dispatch(op);
      },
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
 * Returns a function that stops persistence (flushing pending writes); its
 * `.flush()` property writes pending changes without stopping.
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

export function installPersistence(store: AppStoreInstance, kv: KV, opts: PersistenceOptions = {}): (() => void) & { flush: () => void } {
  const timers = opts.timers ?? defaultTimers;
  const writers: Writer[] = [];
  const unsubs: (() => void)[] = [];

  // Wire one slice to one key: changes mark the writer dirty, and the writer
  // serializes the latest value when its throttle window ends.
  const wire = <T>(select: (s: AppStore) => T, write: (value: T) => void) => {
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
  wire(
    (s) => s.ui,
    (ui) => kv.set(KEYS.ui, JSON.stringify(ui)),
  );
  wire(
    (s) => s.settings,
    (st) => kv.set(KEYS.settings, JSON.stringify(st)),
  );

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

  const stop = () => {
    if (snapshotTimer !== null) timers.clearTimeout(snapshotTimer);
    flushAll();
    unsubs.forEach((u) => u());
  };
  // `.flush()` writes pending changes immediately without stopping persistence
  // (the notification background task must save before it returns).
  return Object.assign(stop, { flush: flushAll });
}
