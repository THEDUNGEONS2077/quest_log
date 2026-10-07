/**
 * __tests__/store/store.test.ts: store actions, undo/redo and persistence
 * wiring (store/createStore.ts, store/history.ts, store/selectors.ts).
 */
import { childIds } from '@/lib/tree';
import { createAppStore, installPersistence } from '@/store/createStore';
import { HISTORY_LIMIT } from '@/store/history';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { makeSelectors } from '@/store/selectors';

import { allTasks, build, ids, tk } from '../helpers/tree';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 7, 12).getTime();

/** A store over in-memory storage with a fixed clock and IDs t1, t2, …. */
function makeStore(kv = createMemoryKV()) {
  let n = 0;
  let now = NOW;
  const store = createAppStore({ kv, now: () => now, newId: () => `t${++n}` });
  return { store, kv, advance: (ms: number) => (now += ms) };
}

describe('task actions and undo/redo', () => {
  it('adds tasks and undoes/redoes them', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    s.addTask(a, 'child');
    expect(childIds(store.getState().tasks, a)).toEqual(['t2']);

    expect(s.undo()).toBe(true);
    expect(childIds(store.getState().tasks, a)).toEqual([]);
    expect(s.redo()).toBe(true);
    expect(childIds(store.getState().tasks, a)).toEqual(['t2']);
  });

  it('coalesces a typing session into one undo step, and splits sessions', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, '');
    s.setEditing(id);
    for (const text of ['S', 'Sh', 'Shi', 'Ship']) s.updateTitle(id, text);
    expect(store.getState().history.past).toHaveLength(2); // add + one typing step

    // A new editing session is a new undo step.
    s.setEditing(null);
    s.setEditing(id);
    s.updateTitle(id, 'Ship it');
    expect(store.getState().history.past).toHaveLength(3);

    s.undo();
    expect(tk(store.getState().tasks, id)!.title).toBe('Ship');
    s.undo();
    expect(tk(store.getState().tasks, id)!.title).toBe(''); // the whole first session at once
    s.redo();
    expect(tk(store.getState().tasks, id)!.title).toBe('Ship');
  });

  it('caps history at the ring-buffer limit', () => {
    const { store } = makeStore();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().addTask(null, `t${i}`);
    expect(store.getState().history.past).toHaveLength(HISTORY_LIMIT);
  });

  it('a new action clears redo', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.addTask(null, 'a');
    s.undo();
    s.addTask(null, 'b');
    expect(s.redo()).toBe(false);
  });
});

describe('hydration and launch purge', () => {
  it('loads saved data synchronously at creation', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['saved']]));
    const { store } = makeStore(kv);
    expect(tk(store.getState().tasks, 'saved')).toBeDefined();
    expect(store.getState().loadStatus).toBe('loaded');
  });

  it('hard-deletes Trash older than 7 days on launch, keeping newer Trash', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['old', { deletedAt: NOW - 8 * DAY }, [['inside']]], ['recent', { deletedAt: NOW - DAY }], ['live']]));
    const { store } = makeStore(kv);
    const remaining = ids(store.getState().tasks);
    expect(remaining).toEqual(['live', 'recent']);
    expect(store.getState().history.past).toHaveLength(0); // purges aren't undoable
  });

  it('takes the daily snapshot a few seconds after a clean load (off the startup path)', () => {
    jest.useFakeTimers();
    const kv = createMemoryKV();
    saveTasks(kv, build([['a']]));
    const { store } = makeStore(kv);
    const stop = installPersistence(store, kv, { listenAppState: false });
    expect(kv.getString('snapshot.2026-10-07')).toBeUndefined();
    jest.advanceTimersByTime(3000);
    expect(kv.getString('snapshot.2026-10-07')).toBeDefined();
    stop();
    jest.useRealTimers();
  });

  it('saves the launch purge result without waiting for a user change', () => {
    jest.useFakeTimers();
    const kv = createMemoryKV();
    saveTasks(kv, build([['gone', { deletedAt: NOW - 30 * DAY }], ['kept']]));
    const { store } = makeStore(kv);
    const stop = installPersistence(store, kv, { listenAppState: false });
    jest.advanceTimersByTime(300);
    stop();
    jest.useRealTimers();
    expect(ids(makeStore(kv).store.getState().tasks)).toEqual(['kept']);
  });
});

describe('persistence wiring', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('saves tasks, ui and settings after the throttle window, and data survives a "relaunch"', () => {
    const { store, kv } = makeStore();
    const stop = installPersistence(store, kv, { listenAppState: false });
    const s = store.getState();
    s.addTask(null, 'persist me');
    s.setTab('completed');
    s.updateSettings({ haptics: false });
    expect(kv.getString('tasks.v1.meta')).toBeUndefined(); // not yet: throttled
    jest.advanceTimersByTime(300);
    stop();

    // "Kill and relaunch": a brand-new store over the same storage.
    const { store: relaunched } = makeStore(kv);
    const r = relaunched.getState();
    expect(allTasks(r.tasks).map((t) => t.title)).toEqual(['persist me']);
    expect(r.ui.tab).toBe('completed');
    expect(r.settings.haptics).toBe(false);
  });

  it('teardown flushes pending writes immediately', () => {
    const { store, kv } = makeStore();
    const stop = installPersistence(store, kv, { listenAppState: false });
    store.getState().addTask(null, 'x');
    stop();
    expect(ids(makeStore(kv).store.getState().tasks)).toEqual(['t1']);
  });
});

describe('selectors', () => {
  it('memoizes rows by structureVersion: typing does not re-flatten', () => {
    const { store } = makeStore();
    const sel = makeSelectors();
    const id = store.getState().addTask(null, 'a');
    const rows1 = sel.activeRows(store.getState());
    store.getState().updateTitle(id, 'abc');
    expect(sel.activeRows(store.getState())).toBe(rows1); // same array: no recompute
    store.getState().editTask(id, { done: true });
    expect(sel.activeRows(store.getState())).not.toBe(rows1);
  });

  it('counts active, completed, done today and overdue', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    s.editTask(a, { dueAt: NOW - 1000 });
    const b = s.addTask(null, 'b');
    s.editTask(b, { done: true, doneAt: NOW - 1000 });
    expect(makeSelectors().counts(store.getState(), NOW)).toEqual({ active: 1, completed: 1, doneToday: 1, overdue: 1 });
  });
});

describe('editing actions', () => {
  it('finishEditing discards an empty task (undoably) and keeps non-empty ones', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, '');
    s.setEditing(id);
    s.finishEditing(id);
    expect(store.getState().editingId).toBeNull();
    expect(ids(store.getState().tasks)).toEqual([]);
    s.undo(); // the discard is a normal history step
    expect(ids(store.getState().tasks)).toEqual([id]);
  });

  it('finishEditing does not clear editing when focus already moved to another row', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    const b = s.addTask(null, 'b');
    s.setEditing(b); // focus moved to b before a's blur arrived
    s.finishEditing(a);
    expect(store.getState().editingId).toBe(b);
  });

  it('quickAdd adds to the end of the current view, including when zoomed', () => {
    const { store } = makeStore();
    const s = store.getState();
    const g = s.addTask(null, 'group');
    s.setZoom(g);
    s.quickAdd('inside');
    expect(store.getState().tasks.children[g]).toHaveLength(1);
  });

  it('long-press collapse applies to every sibling that has children', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    s.addTask(a, 'a1');
    const b = s.addTask(null, 'b');
    s.addTask(b, 'b1');
    const leaf = s.addTask(null, 'leaf');
    s.setSiblingsCollapsed(a, true);
    const t = store.getState().tasks;
    expect([tk(t, a)!.collapsed, tk(t, b)!.collapsed, tk(t, leaf)!.collapsed]).toEqual([true, true, false]);
  });

  it('setEditing records where the caret should go', () => {
    const { store } = makeStore();
    store.getState().setEditing('x', 3);
    expect(store.getState().editingCaret).toBe(3);
  });

  it('toolbar IN / OUT / + SUB build structure while editing continues', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    const b = s.addTask(null, 'b');
    s.setEditing(b);
    s.indentTask(b);
    expect(tk(store.getState().tasks, b)!.parentId).toBe(a);
    expect(store.getState().editingId).toBe(b);
    s.outdentTask(b);
    expect(tk(store.getState().tasks, b)!.parentId).toBeNull();
    s.addSubtask(b);
    const child = store.getState().editingId!;
    expect(tk(store.getState().tasks, child)!.parentId).toBe(b);
  });

  it('undo that removes the edited task ends editing', () => {
    const { store } = makeStore();
    const s = store.getState();
    const parent = s.addTask(null, 'p');
    s.addSubtask(parent); // creates and edits an empty child
    expect(store.getState().editingId).not.toBeNull();
    s.undo();
    expect(store.getState().editingId).toBeNull();
  });
});

describe('completion actions', () => {
  it('checking a top-level task moves it to COMPLETED after lingering, with an UNDO toast', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    expect(s.toggleDone(a)).toBe('moved-to-completed');
    const sel = makeSelectors();
    // Still visible on ACTIVE while the strike plays…
    expect(sel.activeRows(store.getState()).map((r) => r.id)).toEqual([a]);
    expect(store.getState().toast).toMatchObject({ message: 'COMPLETED', undo: true });
    // …then gone from ACTIVE and shown on COMPLETED.
    s.releaseLingering(a);
    expect(sel.activeRows(store.getState())).toEqual([]);
    expect(sel.completedRows(store.getState()).map((r) => r.id)).toEqual([a]);
  });

  it('reports auto-completion of a parent, and undo restores everything', () => {
    const { store } = makeStore();
    const s = store.getState();
    const p = s.addTask(null, 'p');
    const kid = s.addTask(p, 'kid');
    const other = s.addTask(p, 'other');
    expect(s.toggleDone(kid)).toBe('checked');
    expect(s.toggleDone(other)).toBe('moved-to-completed'); // last open child completes p
    expect(tk(store.getState().tasks, p)!.done).toBe(true);
    s.undo();
    expect(tk(store.getState().tasks, p)!.done).toBe(false);
    expect(tk(store.getState().tasks, other)!.done).toBe(false);
  });

  it('unchecking returns "unchecked"', () => {
    const { store } = makeStore();
    const s = store.getState();
    const p = s.addTask(null, 'p');
    const kid = s.addTask(p, 'kid');
    s.addTask(p, 'open');
    s.toggleDone(kid);
    expect(s.toggleDone(kid)).toBe('unchecked');
  });

  it('restore, run again, clear and delete each show a toast', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    s.toggleDone(a);
    s.runAgain(a);
    expect(store.getState().toast!.message).toBe('ADDED TO ACTIVE');
    s.restoreTask(a);
    expect(tk(store.getState().tasks, a)!.done).toBe(false);
    s.toggleDone(a);
    s.clearCompleted(null);
    expect(store.getState().toast!.message).toBe('CLEARED 1');
    s.deleteTask(store.getState().tasks.children.root![1]!);
    expect(store.getState().toast!.message).toBe('DELETED');
  });

  it('dismissToast ignores a toast that has already been replaced', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.showToast('one');
    const first = store.getState().toast!.key;
    s.showToast('two');
    s.dismissToast(first);
    expect(store.getState().toast!.message).toBe('two');
  });
});

describe('details and shorthand (Phase 6)', () => {
  it('quick-add parses shorthand into fields', () => {
    const { store } = makeStore();
    store.getState().quickAdd('buy milk !! @tomorrow // the oat one');
    const t = allTasks(store.getState().tasks)[0]!;
    expect(t).toMatchObject({ title: 'buy milk', priority: 2, notes: 'the oat one', notify: true });
    expect(t.dueAt).toBe(new Date(2026, 9, 8, 9).getTime());
  });

  it('#Group makes later quick-adds go inside it until cleared', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.quickAdd('#Groceries');
    const g = store.getState().quickAddParent!;
    s.quickAdd('milk');
    expect(store.getState().tasks.children[g]).toHaveLength(1);
    s.clearQuickAddParent();
    s.quickAdd('top');
    expect(store.getState().tasks.children.root).toHaveLength(2);
  });

  it('falls back to top level when the #Group target was undone', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.quickAdd('#Gone');
    s.undo();
    s.quickAdd('still works');
    expect(store.getState().quickAddParent).toBeNull();
    expect(store.getState().tasks.children.root).toHaveLength(1);
  });

  it('shorthand typed while editing is applied when editing finishes (one undo step)', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'review');
    s.setEditing(id);
    s.updateTitle(id, 'review !!! @fri');
    s.finishEditing(id);
    expect(tk(store.getState().tasks, id)).toMatchObject({ title: 'review', priority: 3 });
    s.undo(); // undoes the shorthand application
    expect(tk(store.getState().tasks, id)!.title).toBe('review !!! @fri');
  });

  it('an unchanged title is not re-parsed (escaped literals stay literal)', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'email @fri');
    s.setEditing(id);
    s.finishEditing(id);
    expect(tk(store.getState().tasks, id)!.dueAt).toBeNull();
  });

  it('priority cycles, duplicate copies below, outline text', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'a');
    s.cyclePriority(id);
    s.cyclePriority(id);
    expect(tk(store.getState().tasks, id)!.priority).toBe(2);
    s.duplicateTask(id);
    expect(store.getState().tasks.children.root).toHaveLength(2);
    expect(s.outlineText(id)).toBe('a');
  });

  it('notes editing keeps the same session when switching title ↔ notes', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'a');
    s.setEditing(id);
    const session = store.getState().editSession;
    s.setEditing(id, null, 'notes');
    expect(store.getState()).toMatchObject({ editingField: 'notes', editSession: session, editingStartTitle: 'a' });
  });
});
