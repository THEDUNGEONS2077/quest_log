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
import { levelInfo } from '@/lib/xp';
import * as copy from '@/lib/copy';
import * as backup from '@/lib/backup';
import type { DocCounts } from '@/lib/backup';
import * as bulk from '@/lib/bulk';
import * as dnd from '@/lib/dnd';
import * as ops from '@/lib/ops';
import * as outliner from '@/lib/outliner';
import { questOrder, shownZoom } from '@/lib/flatten';
import { parse, type ParseResult } from '@/lib/parser';
import { firstOccurrence, PRESETS } from '@/lib/recurrence';
import { CATEGORIES, type CategoryTab, categoryForNew, onTab, questCategory } from '@/lib/quests';
import { parseOutline, pasteOp, TITLE_MAX } from '@/lib/paste';
import { purgeExpiredTrash } from '@/lib/purge';
import { SAMPLE_OUTLINE } from '@/lib/sample';
import { findTask, taskCount } from '@/lib/taskMap';
import { titleFor } from '@/lib/title';
import { ancestors, childIds, getTask, liveChildIds, toDocument } from '@/lib/tree';
import type { Filter } from '@/lib/search';
import type { ID, Priority, QuestCategory, RepeatRule, Task, TaskFields, TasksDocument, TasksState } from '@/lib/types';

import { readDocument } from './backup';
import { EMPTY_HISTORY, type History, record } from './history';
import { KEYS, type KV, RETIRED_KEYS } from './kv';
import {
  createTasksSaver,
  createThrottledWriter,
  defaultTimers,
  listDailySnapshots,
  loadJSON,
  loadTasks,
  type LoadResult,
  takeDailySnapshot,
  type Timers,
  type Writer,
} from './persist';
import { DEFAULT_ONBOARDING, type Onboarding, type Tip } from './onboarding';
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
/** What a checkbox tap did ('level-up': a plain check that also reached a new level). */
export type ToggleOutcome = 'checked' | 'unchecked' | 'parent-completed' | 'moved-to-completed' | 'repeated' | 'level-up';

/** How long a repeating task shows its strike before un-striking with the new date (PLAN §10.5). */
export const ADVANCE_MS = 500;

/**
 * How long a just-checked top-level task stays on ACTIVE: the strike, scan
 * and "+N XP" play (theme timing.completeHold, 600 ms), then it slides out
 * (200 ms). Long enough to read the XP, short enough not to wait on.
 */
export const LINGER_MS = 800;

/** `dueSheetFor` value meaning "the whole multi-select selection" (PLAN §9.14 DUE). */
export const SELECTION = '*selection*';

/** One tab's search state (PLAN §9.11: each tab keeps its own). */
export interface SearchState {
  open: boolean;
  query: string;
  /** Filter chip (ACTIVE only). */
  filter: Filter;
}

const NO_SEARCH: SearchState = { open: false, query: '', filter: 'all' };

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
  /** Search and filter per tab. Not persisted. */
  search: Record<Tab, SearchState>;
  /** Multi-select (PLAN §9.14): the selected task IDs, or null when not selecting. Not persisted. */
  selection: ID[] | null;
  /** Tasks the Move to… picker is moving, or null when it's closed. Not persisted. */
  movePickerFor: ID[] | null;
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
  /**
   * The XP the last checkbox / swipe completion earned, and on which task:
   * that row floats "+N XP" (components/list/CompleteBurst.tsx). Not persisted.
   */
  lastGain: { id: ID; xp: number } | null;
  /** The toast on screen, if any. Not persisted. */
  toast: Toast | null;
  /** First-run tips seen and the last "What's new" shown. Persisted (store/onboarding.ts). */
  onboarding: Onboarding;
  /**
   * Bumped to ask the quick-add bar to take focus (app icon "New task"
   * quick action, first launch). Not persisted.
   */
  quickAddFocus: number;
  /**
   * Bumped to scroll the visible list to its top: a new quest was added at
   * the top (quick-add, paste; FlashList otherwise keeps the rows you were
   * looking at in place, leaving the new quest just above the screen), the
   * selected tab was tapped again, or the title was tapped (home).
   */
  revealTop: number;
  /**
   * The quest order locked while a task is being edited (lib/flatten.ts
   * questOrder), so the list can't re-sort under the editor, and while a
   * completed quest plays its exit (it would otherwise jump to the top as
   * "just modified" and leave from there). Released when neither is going
   * on. Not persisted.
   */
  questOrderLock: ID[] | null;
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
  /** Shows a first-run tip as a toast and records it as seen (each tip shows once). */
  showTip(tip: Tip): void;
  // --- Data (Phase 13: backup, import, snapshots) ---
  /** The whole tree as one document, Trash included (for Export). */
  exportDocument(): TasksDocument;
  /**
   * Brings in a backup's tasks as one undo step: 'merge' adds only tasks the
   * app doesn't have; 'replace' swaps the whole tree. Returns how many tasks
   * were added (merge) or are now in the tree (replace).
   */
  importTasks(doc: TasksDocument, mode: 'merge' | 'replace'): number;
  /** The daily safety snapshots, newest first, with what each holds. Unreadable ones are left out. */
  listSnapshots(): { key: string; date: string; doc: TasksDocument; counts: DocCounts }[];
  /** Replaces the tree with a daily snapshot (one undo step). False if it can't be read. */
  restoreSnapshot(key: string): boolean;
  /** Records that "What's new" for this build has been shown (or skipped). */
  markWhatsNewSeen(build: number): void;
  /** Empty state → Load example tasks: adds the demo tree at the top level (one undo step). */
  loadExampleTasks(): void;
  /**
   * Opens the ACTIVE tab ready to type a new task: leaves editing, selection
   * and search, then asks the quick-add bar to take focus.
   */
  requestQuickAdd(): void;
  /** Hides the toast, only if it's still the one with this key. */
  dismissToast(key: number): void;

  // --- UI actions ---
  /** The ACTIVE / COMPLETED switch. Ends editing and selection first (the rows change). */
  setTab(tab: Tab): void;
  /**
   * Android back on the main screen: steps out of the innermost mode, one
   * per press: selection, search, zoom (a level), COMPLETED → ACTIVE, a
   * category tab → ALL. Returns false when there's nothing left (the app
   * then closes).
   */
  backStep(): boolean;
  /** Shows a quest tab (ALL / DAILY / MAIN / MISC); leaves zoom and the #Group target. */
  setCategoryTab(category: CategoryTab): void;
  /**
   * The selected tab (a quest tab or ACTIVE / COMPLETED) tapped again: back
   * to the top of that view. Zoomed in, out to the tab's top level first;
   * otherwise the list scrolls to its top.
   */
  toTabTop(): void;
  /**
   * The title tapped: home, i.e. ALL quests, ACTIVE, top level, no search,
   * scrolled to the top. From anywhere on the main screen, one tap.
   */
  goHome(): void;
  /** Hold menu → Category: moves a quest to another tab (one undo step, with a toast). */
  setQuestCategory(id: ID, category: QuestCategory): void;
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
  parseShorthand(text: string, literal?: ReadonlySet<string>, existingDue?: number | null): ParseResult;
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

  // --- Navigation and power features (Phase 10) ---
  /** Zoom out one level (to the zoom root's parent, or the whole list). */
  zoomOut(): void;
  /** Opens/closes search on a tab, or changes its query or filter. */
  setSearch(tab: Tab, patch: Partial<SearchState>): void;
  /** Closes search on a tab and clears it. */
  closeSearch(tab: Tab): void;
  /** Starts multi-select with one task selected. */
  startSelection(id: ID): void;
  /** Adds or removes a task from the selection (ends select mode when empty). */
  toggleSelected(id: ID): void;
  clearSelection(): void;
  /** Bulk DONE / PRI / DEL / GROUP on the selection; each is one undo step. */
  completeSelection(): void;
  setSelectionPriority(priority: Priority): void;
  /** Bulk PRI: the next priority after the first selected task's, applied to all. */
  cycleSelectionPriority(): void;
  /** Bulk DUE: the same date (and notify) on every selected root. */
  setDueMany(ids: ID[], dueAt: number | null, notify: boolean): void;
  deleteSelection(): void;
  groupSelection(): void;
  /** Opens the Move to… picker for these tasks. */
  openMovePicker(ids: ID[]): void;
  closeMovePicker(): void;
  /** Moves tasks (with their subtrees) to the end of `parentId` (null = top level). */
  moveTo(ids: ID[], parentId: ID | null): void;
  /** Sort a parent's subtasks once (PLAN §9.12). */
  sortSubtasks(parentId: ID, key: bulk.SortKey): void;
  /** Trash: restore to the original place, or delete permanently. */
  restoreFromTrash(id: ID): void;
  purgeFromTrash(ids: ID[]): void;
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

  // Launch auto-clear (setting "Auto-clear completed"): completed tasks older
  // than 30 or 90 days move to Trash, where they stay restorable for 7 days.
  const settings = loadJSON(kv, KEYS.settings, DEFAULT_SETTINGS);
  if (settings.autoClearCompleted !== 'off') {
    const cleared = complete.clearCompleted(tasks, now(), settings.autoClearCompleted);
    if (cleared) tasks = ops.apply(tasks, cleared.op).state;
  }

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

  /**
   * Ends task `id`'s editing session, however it ends (Enter, DONE, the
   * keyboard closing, tapping another task, the quick-add bar taking focus):
   *   - shorthand typed during the session (!!, @fri, //…) becomes fields, as
   *     one undo step. Only newly typed words count (the words of the title
   *     when editing started stay literal), and dates amend the existing due
   *     date: "@5pm" keeps its day, "@mon" keeps its time;
   *   - an objective (subtask) whose title was changed gets a capital first
   *     letter (lib/title.ts), in the same undo step;
   *   - a task left empty with no children is discarded (undoable).
   * `startTitle` is the title when editing started (null: no shorthand pass).
   */
  const commitEdit = (id: ID, startTitle: string | null) => {
    const s = store.getState();
    let task = findTask(s.tasks, id);
    if (task && startTitle !== null && task.title !== startTitle) {
      const r = s.parseShorthand(task.title, new Set(startTitle.split(/\s+/).filter(Boolean)), task.dueAt);
      let fields: Partial<TaskFields> = {};
      if (r.chips.length) {
        // Typing only shorthand ("!!") must not empty the title (which would delete the task).
        fields = { ...shorthandFields(r, task.dueAt), title: r.title || startTitle };
        // `//` appends to existing notes rather than replacing them.
        if (r.notes !== undefined && task.notes) fields.notes = `${task.notes}\n${r.notes}`;
      }
      // Only when the title was edited: opening and closing an old lowercase
      // objective changes nothing (it's capitalized on display instead).
      const title = fields.title ?? task.title;
      if (titleFor(task.parentId, title) !== title) fields.title = titleFor(task.parentId, title);
      if (Object.keys(fields).length) {
        s.dispatch(ops.editTask(s.tasks, id, fields, now()));
        task = findTask(store.getState().tasks, id);
      }
    }
    if (task && task.title === '' && liveChildIds(store.getState().tasks, id).length === 0) {
      store.getState().dispatch({ type: 'remove', id });
    }
  };

  /**
   * Before the list changes underneath (switching the quest tab or the
   * ACTIVE / COMPLETED switch): end editing (committing it, as Enter would),
   * selection and the open menu, so no editor or selection is left on rows
   * the new view doesn't show.
   */
  const leaveListModes = () => {
    const s = store.getState();
    if (s.editingId !== null) s.setEditing(null);
    if (s.selection) s.clearSelection();
    if (s.menuFor) store.setState({ menuFor: null });
  };

  /** Undo/redo can remove the task being edited; editing then ends instead of pointing at nothing. */
  const stopEditingIfGone = (next: TasksState): Partial<AppStore> => {
    const id = store.getState().editingId;
    return id !== null && !findTask(next, id) ? { editingId: null, editingCaret: null, questOrderLock: null } : {};
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
      search: { active: NO_SEARCH, completed: NO_SEARCH },
      selection: null,
      movePickerFor: null,
      editSession: 0,
      settings,
      lingering: [],
      advancing: [],
      lastGain: null,
      toast: null,
      onboarding: loadJSON(kv, KEYS.onboarding, DEFAULT_ONBOARDING),
      quickAddFocus: 0,
      revealTop: 0,
      questOrderLock: null,
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
        const task: Task = { ...ops.newTask(id, parent, titleFor(parent, r.title.slice(0, TITLE_MAX)), now()), ...shorthandFields(r) };
        // A new quest (top level) joins the tab it was added on (lib/quests.ts). On DAILY
        // it repeats daily unless the shorthand said otherwise: a daily quest resets each
        // day, and earns the repeat and day streaks (lib/xp.ts).
        if (parent === null) {
          task.category = categoryForNew(get().ui.category);
          if (task.category === 'daily' && !task.repeat) {
            const { notifyByDefault, defaultTimeMinutes } = get().settings;
            const daily = { ...PRESETS.daily };
            task.repeat = daily;
            if (task.dueAt === null)
              Object.assign(task, { dueAt: firstOccurrence(daily, now(), defaultTimeMinutes), notify: notifyByDefault });
          }
        }
        get().dispatch(ops.addTask(get().tasks, task));
        // A new quest sorts first: bring the list to the top to show it.
        if (parent === null) set({ revealTop: get().revealTop + 1 });
        // `#Group`: the next quick-adds go inside it (PLAN §9.4 "ready for children").
        if (r.group) set({ quickAddParent: id });
      },

      quickPaste(text) {
        const parent = get().ui.zoomRootId;
        const tasks = get().tasks;
        const lines = parseOutline(text);
        const { op, ids } = pasteOp(tasks, lines, parent, childIds(tasks, parent).length, now(), newId);
        // Pasted quests (top level) join the current tab, like quick-added ones.
        const category = categoryForNew(get().ui.category);
        const quests = parent === null ? ids.filter((_, i) => lines[i]!.depth === 0) : [];
        get().dispatch(
          quests.length
            ? { type: 'batch', ops: [op, { type: 'update', changes: quests.map((id) => ({ id, fields: { category } })) }] }
            : op,
        );
        if (quests.length) set({ revealTop: get().revealTop + 1 });
      },

      finishEditing(id) {
        // Still this task's session: ending it commits it (setEditing → commitEdit).
        if (get().editingId === id) get().setEditing(null);
        // Already moved on (that switch committed it): just make sure an empty
        // task isn't left behind, e.g. by a late blur.
        else commitEdit(id, null);
      },

      toggleCollapsed(id) {
        const task = getTask(get().tasks, id);
        // A view change, not an edit: no updatedAt bump, so the quest doesn't
        // sort to the top just for being opened or closed.
        get().dispatch({ type: 'update', changes: [{ id, fields: { collapsed: !task.collapsed } }] });
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
          set({ lastGain: null });
          return 'unchecked';
        }
        const r = complete.check(tasks, id, now());
        const xpBefore = tasks.progress.xp;
        // A quest leaving ACTIVE lingers while its completion plays (TaskRow), then goes.
        // Marked before the change lands, so a zoom into it holds until then (shownZoom).
        // Timed here, not by its row: zoomed into the quest, that row isn't on screen.
        const leaving = r.advanced ? null : r.completedTopLevel;
        if (leaving) {
          // The order as it was: the quest leaves from where it is (questOrderLock).
          set({ lingering: [...get().lingering, leaving], questOrderLock: get().questOrderLock ?? questOrder(tasks) });
          setTimeout(() => get().releaseLingering(leaving), LINGER_MS);
        }
        get().dispatch(r.op);
        // XP feedback (lib/xp.ts): what this earned, and a new level if one was reached.
        const xpAfter = get().tasks.progress.xp;
        set({ lastGain: xpAfter > xpBefore ? { id, xp: xpAfter - xpBefore } : null });
        const newLevel = levelInfo(xpAfter).level > levelInfo(xpBefore).level ? levelInfo(xpAfter).level : null;
        const xpNote = `${xpAfter > xpBefore ? ` · +${xpAfter - xpBefore} XP` : ''}${newLevel !== null ? ` · LEVEL ${newLevel}!` : ''}`;
        if (r.advanced) {
          // Repeat: strike, hold, then un-strike with the new date chip.
          set({ advancing: [...get().advancing, r.advanced.id] });
          get().showToast(`NEXT: ${formatDue(r.advanced.nextDue, now())}${xpNote}`, true);
          return 'repeated';
        }
        if (r.completedTopLevel) {
          get().showToast(`${r.completedTopLevel === id ? 'COMPLETED' : 'COMPLETED · GROUP DONE'}${xpNote}`, true);
          return 'moved-to-completed';
        }
        // A subtask: no toast unless it brought a new level (the XP bar shows the gain).
        if (newLevel !== null) {
          get().showToast(`+${xpAfter - xpBefore} XP · LEVEL ${newLevel}!`, true);
          return 'level-up';
        }
        return r.autoCompleted.length ? 'parent-completed' : 'checked';
      },

      releaseAdvancing(id) {
        if (get().advancing.includes(id)) set({ advancing: get().advancing.filter((x) => x !== id) });
      },

      releaseLingering(id) {
        if (!get().lingering.includes(id)) return;
        const lingering = get().lingering.filter((x) => x !== id);
        // The last exit done and nothing being edited: the list may re-sort again.
        const unlock = lingering.length === 0 && get().editingId === null;
        set({ lingering, ...(unlock && { questOrderLock: null }) });
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

      showTip(tip) {
        const { onboarding } = get();
        if (onboarding.tipsSeen.includes(tip.id)) return;
        set({ onboarding: { ...onboarding, tipsSeen: [...onboarding.tipsSeen, tip.id] } });
        get().showToast(tip.message);
      },

      exportDocument: () => toDocument(get().tasks),

      importTasks(doc, mode) {
        // Leave modes that point at tasks which may be gone after this.
        const s = get();
        if (s.editingId !== null) s.setEditing(null);
        if (s.selection) s.clearSelection();
        set({ ui: { ...get().ui, zoomRootId: null }, menuFor: null });
        if (mode === 'replace') {
          const op = backup.replaceOp(get().tasks, doc);
          if (op) get().dispatch(op);
          get().showToast('REPLACED FROM BACKUP', true);
          return taskCount(get().tasks);
        }
        const { op, added } = backup.mergeOp(get().tasks, doc);
        if (op) get().dispatch(op);
        get().showToast(added ? `ADDED ${added} TASK${added === 1 ? '' : 'S'}` : 'NOTHING NEW TO ADD', added > 0);
        return added;
      },

      listSnapshots() {
        const out: { key: string; date: string; doc: TasksDocument; counts: DocCounts }[] = [];
        for (const key of listDailySnapshots(kv)) {
          try {
            const doc = readDocument(JSON.parse(kv.getString(key) ?? ''));
            out.push({ key, date: key.slice(KEYS.snapshotPrefix.length), doc, counts: backup.countDocument(doc) });
          } catch {
            // Unreadable snapshot: not offered.
          }
        }
        return out;
      },

      restoreSnapshot(key) {
        const snap = get()
          .listSnapshots()
          .find((x) => x.key === key);
        if (!snap) return false;
        get().importTasks(snap.doc, 'replace');
        get().showToast(`RESTORED ${snap.date}`, true);
        return true;
      },

      markWhatsNewSeen(build) {
        set({ onboarding: { ...get().onboarding, lastSeenBuild: build } });
      },

      loadExampleTasks() {
        // Shown on ALL, so they're visible whichever tab the empty list was on.
        if (get().ui.category !== 'all') get().setCategoryTab('all');
        const tasks = get().tasks;
        const { op } = pasteOp(tasks, parseOutline(SAMPLE_OUTLINE), null, childIds(tasks, null).length, now(), newId);
        get().dispatch(op);
        get().showToast('EXAMPLE TASKS ADDED', true);
      },

      requestQuickAdd() {
        const s = get();
        if (s.editingId !== null) s.finishEditing(s.editingId);
        if (s.selection) s.clearSelection();
        if (s.search.active.open) s.closeSearch('active');
        if (s.ui.tab !== 'active') s.setTab('active');
        set({ menuFor: null, quickAddFocus: get().quickAddFocus + 1 });
      },

      replaceAll(next) {
        // Keep structureVersion increasing, so memoized rows can't be stale.
        const structureVersion = Math.max(next.structureVersion, get().tasks.structureVersion) + 1;
        set({ tasks: { ...next, structureVersion }, history: EMPTY_HISTORY, ui: { ...get().ui, zoomRootId: null } });
      },

      setTab(tab) {
        if (tab === get().ui.tab) return;
        leaveListModes();
        set({ ui: { ...get().ui, tab } });
      },

      toTabTop() {
        const s = get();
        if (s.ui.tab === 'active' && s.ui.zoomRootId !== null) {
          leaveListModes();
          s.setZoom(null);
          return;
        }
        set({ revealTop: s.revealTop + 1 });
      },

      goHome() {
        const s = get();
        if (s.editingId !== null) s.finishEditing(s.editingId);
        s.setCategoryTab('all');
        s.setTab('active');
        leaveListModes();
        if (get().search.active.open) s.closeSearch('active');
        set({ ui: { ...get().ui, zoomRootId: null }, quickAddParent: null, revealTop: get().revealTop + 1 });
      },

      setCategoryTab(category) {
        if (category === get().ui.category) return;
        // Leave modes tied to quests the new tab may not show.
        leaveListModes();
        set({ ui: { ...get().ui, category, zoomRootId: null }, quickAddParent: null });
      },

      backStep() {
        const s = get();
        if (s.selection) {
          s.clearSelection();
          return true;
        }
        if (s.search[s.ui.tab].open) {
          s.closeSearch(s.ui.tab);
          return true;
        }
        if (s.ui.tab === 'active' && s.ui.zoomRootId) {
          s.zoomOut();
          return true;
        }
        if (s.ui.tab === 'completed') {
          s.setTab('active');
          return true;
        }
        if (s.ui.category !== 'all') {
          s.setCategoryTab('all');
          return true;
        }
        return false;
      },

      setQuestCategory(id, category) {
        get().dispatch(ops.editTask(get().tasks, id, { category }, now()));
        get().showToast(`MOVED TO ${CATEGORIES.find((c) => c.key === category)!.label}`, true);
      },
      setZoom: (zoomRootId) => set({ ui: { ...get().ui, zoomRootId } }),
      setEditing: (editingId, caret = null, field = 'title') => {
        // Leaving another task's session (for a new task, or for none): commit it
        // first, exactly as Enter would, so its shorthand is never left as raw text.
        const prev = get().editingId;
        if (prev !== null && prev !== editingId) commitEdit(prev, get().editingStartTitle);
        // A new editing session starts a new undo step for typing. The quest order locks
        // when editing starts and unlocks when it ends (not when moving between tasks),
        // unless a completed quest is still leaving (releaseLingering unlocks it then).
        const holdOrder = editingId !== null || get().lingering.length > 0;
        set({
          questOrderLock: holdOrder ? (get().questOrderLock ?? questOrder(get().tasks)) : null,
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
        });
      },

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

      parseShorthand: (text, literal, existingDue) =>
        parse(text, { now: now(), defaultTimeMinutes: get().settings.defaultTimeMinutes, literal, existingDue }),

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
          // On COMPLETED: expand the completed ancestors (the tab's own expanded set), on a
          // quest tab that lists it.
          const expanded = new Set([...get().ui.completedExpanded, ...chain]);
          const category = onTab(getTask(tasks, top), get().ui.category) ? get().ui.category : questCategory(getTask(tasks, top));
          set({ ui: { ...get().ui, tab: 'completed', completedExpanded: [...expanded], category }, highlightId: id });
          return;
        }
        // On ACTIVE: expand collapsed ancestors. Not an undo step (it's navigation).
        // Show it on a tab that lists it: stay if the current one does, else its own.
        const shownOn = onTab(getTask(tasks, top), get().ui.category) ? get().ui.category : questCategory(getTask(tasks, top));
        const collapsed = chain.filter((a) => getTask(tasks, a).collapsed);
        if (collapsed.length) {
          get().dispatch({ type: 'update', changes: collapsed.map((a) => ({ id: a, fields: { collapsed: false } })) }, { undoable: false });
        }
        set({ ui: { ...get().ui, tab: 'active', zoomRootId: null, category: shownOn }, highlightId: id });
      },

      clearHighlight: () => set({ highlightId: null }),

      setDragging: (draggingId) => set({ draggingId }),

      zoomOut() {
        const root = get().ui.zoomRootId;
        if (root === null) return;
        const parent = findTask(get().tasks, root)?.parentId ?? null;
        get().setZoom(parent);
      },

      setSearch(tab, patch) {
        set({ search: { ...get().search, [tab]: { ...get().search[tab], ...patch } } });
      },

      closeSearch(tab) {
        set({ search: { ...get().search, [tab]: NO_SEARCH } });
      },

      startSelection(id) {
        get().setEditing(null);
        set({ selection: [id], menuFor: null });
      },

      toggleSelected(id) {
        const sel = get().selection ?? [];
        const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        set({ selection: next.length ? next : null });
      },

      clearSelection: () => set({ selection: null }),

      completeSelection() {
        const op = bulk.completeMany(get().tasks, get().selection ?? [], now());
        if (op) get().dispatch(op);
        const n = get().selection?.length ?? 0;
        set({ selection: null });
        if (op) get().showToast(`COMPLETED ${n}`, true);
      },

      setSelectionPriority(priority) {
        const op = bulk.editMany(get().tasks, get().selection ?? [], { priority }, now());
        if (op) get().dispatch(op);
      },

      cycleSelectionPriority() {
        const roots = bulk.selectionRoots(get().tasks, get().selection ?? []);
        const first = roots[0] ? findTask(get().tasks, roots[0]) : undefined;
        if (first) get().setSelectionPriority(((first.priority + 1) % 4) as Priority);
      },

      setDueMany(ids, dueAt, notify) {
        const op = bulk.editMany(get().tasks, ids, { dueAt, notify: dueAt === null ? false : notify }, now());
        if (op) get().dispatch(op);
      },

      deleteSelection() {
        const n = get().selection?.length ?? 0;
        const op = bulk.deleteMany(get().tasks, get().selection ?? [], now());
        set({ selection: null });
        if (op) {
          get().dispatch(op);
          get().showToast(`DELETED ${n}`, true);
        }
      },

      groupSelection() {
        const r = bulk.groupMany(get().tasks, get().selection ?? [], newId(), now());
        set({ selection: null });
        if (!r) return;
        get().dispatch(r.op);
        // Name the new group right away.
        get().setEditing(r.groupId);
      },

      openMovePicker: (ids) => set({ movePickerFor: ids, menuFor: null }),
      closeMovePicker: () => set({ movePickerFor: null }),

      moveTo(ids, parentId) {
        const op = bulk.moveManyTo(get().tasks, ids, parentId, now());
        set({ movePickerFor: null, selection: null });
        if (!op) return;
        get().dispatch(op);
        get().showToast(ids.length > 1 ? `MOVED ${ids.length}` : 'MOVED', true);
      },

      sortSubtasks(parentId, key) {
        const op = bulk.sortChildren(get().tasks, parentId, key, now());
        if (!op) {
          get().showToast('ALREADY IN ORDER', false);
          return;
        }
        get().dispatch(op);
        get().showToast('SORTED', true);
      },

      restoreFromTrash(id) {
        get().dispatch(ops.restore(get().tasks, id, now()));
        get().showToast('RESTORED', true);
      },

      purgeFromTrash(ids) {
        const op = bulk.purgeMany(get().tasks, ids);
        if (op) get().dispatch(op);
      },
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

  // Zoomed into a quest that leaves the view (completed, deleted, undone away):
  // step back out to where it still is (lib/flatten.ts shownZoom). Cheap: a
  // walk up a few parents, and nothing at all when not zoomed.
  store.subscribe(
    (s) => shownZoom(s.tasks, s.ui.zoomRootId, s.ui.category, s.lingering),
    (zoom) => {
      if (zoom !== store.getState().ui.zoomRootId) store.getState().setZoom(zoom);
    },
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

  // Tidy up keys earlier versions left behind (store/kv.ts RETIRED_KEYS).
  if (store.writable) for (const key of RETIRED_KEYS) if (kv.getString(key) !== undefined) kv.remove(key);
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
    (s) => s.onboarding,
    (o) => kv.set(KEYS.onboarding, JSON.stringify(o)),
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
