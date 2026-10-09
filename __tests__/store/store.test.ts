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

describe('XP (lib/xp.ts) through the store', () => {
  it('is saved and loaded with the tasks, and a new level is announced', () => {
    const kv = createMemoryKV();
    const { store } = makeStore(kv);
    const stop = installPersistence(store, kv);
    const s = store.getState();
    const ids = Array.from({ length: 5 }, (_, i) => s.addTask(null, `t${i}`));
    for (const id of ids.slice(0, 4)) s.toggleDone(id);
    expect(store.getState().tasks.progress.xp).toBe(40);
    // The fifth reaches 50 XP: level 1, with the success outcome and a toast.
    expect(s.toggleDone(ids[4]!)).toBe('moved-to-completed');
    expect(store.getState().toast?.message).toBe('COMPLETED · +10 XP · LEVEL 1!');
    stop.flush();
    stop();
    expect(makeStore(kv).store.getState().tasks.progress).toMatchObject({ xp: 50, dayStreak: 1 });
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
    // The toast says what it earned (lib/xp.ts: a plain task is 10 XP).
    expect(store.getState().toast).toMatchObject({ message: 'COMPLETED · +10 XP', undo: true });
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

  it('shorthand is applied when editing moves to another task, not only on Enter (bug 2026-10-09)', () => {
    const { store } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'call bank');
    const b = s.addTask(null, 'gym');
    s.setEditing(a);
    s.updateTitle(a, 'call bank !! @tomorrow');
    s.setEditing(b); // tapped another task: no Enter, no blur-finish
    expect(tk(store.getState().tasks, a)).toMatchObject({ title: 'call bank', priority: 2 });
    expect(tk(store.getState().tasks, a)!.dueAt).not.toBeNull();
    // Same when the quick-add bar takes focus (editing ends with null).
    s.updateTitle(b, 'gym !!!');
    s.setEditing(null);
    expect(tk(store.getState().tasks, b)).toMatchObject({ title: 'gym', priority: 3 });
  });

  it('an empty new task is discarded when editing moves elsewhere', () => {
    const { store } = makeStore();
    const s = store.getState();
    const keep = s.addTask(null, 'keep');
    const empty = s.addTask(null, '');
    s.setEditing(empty);
    s.setEditing(keep);
    expect(tk(store.getState().tasks, empty)).toBeUndefined();
  });

  it('amending a date by shorthand keeps the parts you did not type', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'dentist');
    // Due in 3 days at 15:00.
    const due = new Date(NOW + 3 * DAY);
    due.setHours(15, 0, 0, 0);
    s.setDue(id, due.getTime(), false);
    // "@5pm": same day, new time.
    s.setEditing(id);
    s.updateTitle(id, 'dentist @5pm');
    s.finishEditing(id);
    const at = new Date(tk(store.getState().tasks, id)!.dueAt!);
    expect([at.getDate(), at.getHours()]).toEqual([due.getDate(), 17]);
    expect(tk(store.getState().tasks, id)!.title).toBe('dentist');
    // "@tomorrow": new day, the 17:00 time kept (not the 09:00 default).
    s.setEditing(id);
    s.updateTitle(id, 'dentist @tomorrow');
    s.finishEditing(id);
    const t = new Date(tk(store.getState().tasks, id)!.dueAt!);
    expect([t.getDate(), t.getHours()]).toEqual([new Date(NOW + DAY).getDate(), 17]);
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

describe('due dates and reveal (Phase 7)', () => {
  it('setDue sets date and notify as one undo step; clearing turns notify off', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'a');
    s.setDue(id, NOW + 1000, true);
    expect(tk(store.getState().tasks, id)).toMatchObject({ dueAt: NOW + 1000, notify: true });
    s.setDue(id, null, true);
    expect(tk(store.getState().tasks, id)).toMatchObject({ dueAt: null, notify: false });
    s.undo();
    expect(tk(store.getState().tasks, id)!.dueAt).toBe(NOW + 1000);
  });

  it('revealTask expands collapsed ancestors, leaves zoom and highlights', () => {
    const { store } = makeStore();
    const s = store.getState();
    const g = s.addTask(null, 'group');
    const kid = s.addTask(g, 'kid');
    s.editTask(g, { collapsed: true });
    s.setZoom(g);
    s.setTab('completed');
    s.revealTask(kid);
    const st = store.getState();
    expect(tk(st.tasks, g)!.collapsed).toBe(false);
    expect(st.ui).toMatchObject({ tab: 'active', zoomRootId: null });
    expect(st.highlightId).toBe(kid);
  });

  it('revealTask of a completed task opens COMPLETED with its ancestors expanded', () => {
    const { store } = makeStore();
    const s = store.getState();
    const g = s.addTask(null, 'group');
    const kid = s.addTask(g, 'kid');
    s.toggleDone(g);
    s.revealTask(kid);
    expect(store.getState().ui.tab).toBe('completed');
    expect(store.getState().ui.completedExpanded).toContain(g);
  });

  it('the due-date sheet opens and closes per task', () => {
    const { store } = makeStore();
    store.getState().openDueSheet('x');
    expect(store.getState().dueSheetFor).toBe('x');
    store.getState().closeDueSheet();
    expect(store.getState().dueSheetFor).toBeNull();
  });
});

describe('external ops queue (services/externalOps)', () => {
  it('drains queued notification actions into undoable ops with a toast, then clears', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- service imported lazily to keep this file's top imports pure
    const { appendExternalOp, drainExternalOps } = require('@/services/externalOps') as typeof import('@/services/externalOps');
    const { store, kv } = makeStore();
    const id = store.getState().addTask(null, 'a');
    appendExternalOp(kv, { kind: 'complete', taskId: id, at: NOW, source: 'notification' });
    appendExternalOp(kv, { kind: 'complete', taskId: id, at: NOW, source: 'notification' }); // duplicate: idempotent
    expect(drainExternalOps(kv, store)).toBe(1);
    expect(tk(store.getState().tasks, id)!.done).toBe(true);
    expect(store.getState().toast!.message).toBe('COMPLETED FROM NOTIFICATION');
    expect(kv.getString('ops.pending')).toBeUndefined();
    store.getState().undo();
    expect(tk(store.getState().tasks, id)!.done).toBe(false);
  });
});

describe('recurring tasks (Phase 8)', () => {
  it('checking a repeating task returns "repeated", advances it and archives a copy, with a NEXT toast', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.quickAdd('standup *daily @tomorrow');
    const id = store.getState().tasks.children.root![0]!;
    const due = tk(store.getState().tasks, id)!.dueAt!;
    expect(s.toggleDone(id)).toBe('repeated');
    const st = store.getState();
    expect(tk(st.tasks, id)).toMatchObject({ done: false, dueAt: due + DAY });
    expect(st.tasks.children.root).toHaveLength(2); // live task + archived copy
    expect(st.advancing).toEqual([id]);
    expect(st.toast!.message).toMatch(/^NEXT: /);
    s.undo();
    expect(store.getState().tasks.children.root).toHaveLength(1);
    expect(tk(store.getState().tasks, id)!.dueAt).toBe(due);
  });

  it('setRepeat gives a task without a date its first occurrence, and stopping keeps the date', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'water plants');
    s.setRepeat(id, { freq: 'day', interval: 2, from: 'schedule' });
    const t = tk(store.getState().tasks, id)!;
    expect(t.dueAt).toBe(new Date(2026, 9, 8, 9).getTime()); // tomorrow 09:00 (noon now)
    expect(t.notify).toBe(true);
    s.setRepeat(id, null);
    expect(tk(store.getState().tasks, id)).toMatchObject({ repeat: null, dueAt: t.dueAt });
  });

  it('monthly repeats remember their day of the month', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'rent');
    s.setDue(id, new Date(2026, 9, 31, 9).getTime(), true);
    s.setRepeat(id, { freq: 'month', interval: 1, from: 'schedule' });
    expect(tk(store.getState().tasks, id)!.repeat!.monthDay).toBe(31);
  });
});

describe('navigation and power features (Phase 10)', () => {
  /** A store with: work [ship, notes [draft]], home [bank]. */
  function tree() {
    const kv = createMemoryKV();
    saveTasks(
      kv,
      build([
        ['work', [['ship'], ['notes', [['draft']]]]],
        ['home', [['bank']]],
      ]),
    );
    return makeStore(kv).store;
  }

  it('zoomOut climbs one level at a time', () => {
    const store = tree();
    store.getState().setZoom('notes');
    store.getState().zoomOut();
    expect(store.getState().ui.zoomRootId).toBe('work');
    store.getState().zoomOut();
    expect(store.getState().ui.zoomRootId).toBeNull();
  });

  it('search filters the ACTIVE rows; closing restores the full list', () => {
    const store = tree();
    const sel = makeSelectors();
    store.getState().setSearch('active', { open: true, query: 'draft' });
    expect(sel.activeRows(store.getState()).map((r) => r.id)).toEqual(['work', 'notes', 'draft']);
    store.getState().closeSearch('active');
    expect(sel.activeRows(store.getState())).toHaveLength(6);
  });

  it('selection: toggle, bulk DONE as one undo step, and select mode ends', () => {
    const store = tree();
    const s = store.getState();
    s.startSelection('ship');
    s.toggleSelected('bank');
    s.completeSelection();
    expect([tk(store.getState().tasks, 'ship')!.done, tk(store.getState().tasks, 'bank')!.done]).toEqual([true, true]);
    expect(store.getState().selection).toBeNull();
    s.undo();
    expect(tk(store.getState().tasks, 'ship')!.done).toBe(false);
  });

  it('toggling off the last selected task ends select mode', () => {
    const store = tree();
    store.getState().startSelection('ship');
    store.getState().toggleSelected('ship');
    expect(store.getState().selection).toBeNull();
  });

  it('PRI on a selection cycles from the first task’s priority', () => {
    const store = tree();
    const s = store.getState();
    s.startSelection('ship');
    s.toggleSelected('bank');
    s.cycleSelectionPriority();
    s.cycleSelectionPriority();
    expect([tk(store.getState().tasks, 'ship')!.priority, tk(store.getState().tasks, 'bank')!.priority]).toEqual([2, 2]);
  });

  it('GROUP wraps the selection and starts naming the group', () => {
    const store = tree();
    const s = store.getState();
    s.startSelection('ship');
    s.toggleSelected('notes');
    s.groupSelection();
    const g = store.getState().editingId!;
    expect(store.getState().tasks.children[g]).toEqual(['ship', 'notes']);
  });

  it('Move to… moves to the end of the destination', () => {
    const store = tree();
    store.getState().openMovePicker(['bank']);
    store.getState().moveTo(['bank'], 'notes');
    expect(store.getState().tasks.children.notes).toEqual(['draft', 'bank']);
    expect(store.getState().movePickerFor).toBeNull();
  });

  it('Trash: delete, restore to the same place, or purge for good', () => {
    const store = tree();
    const s = store.getState();
    s.deleteTask('ship');
    s.restoreFromTrash('ship');
    expect(store.getState().tasks.children.work).toEqual(['ship', 'notes']);
    expect(tk(store.getState().tasks, 'ship')!.deletedAt).toBeNull();
    s.deleteTask('ship');
    s.purgeFromTrash(['ship']);
    expect(tk(store.getState().tasks, 'ship')).toBeUndefined();
  });

  it('sort subtasks A–Z', () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['p', [['b'], ['a']]]]));
    const store = makeStore(kv).store;
    store.getState().sortSubtasks('p', 'alpha');
    expect(store.getState().tasks.children.p).toEqual(['a', 'b']);
  });
});

describe('quest tabs (lib/quests.ts, user request 2026-10-09)', () => {
  it('a quest added on a tab joins it; on DAILY it repeats daily, due at the default time', () => {
    const { store } = makeStore();
    const s = store.getState();
    s.setCategoryTab('daily');
    s.quickAdd('Stretch');
    const t = tk(store.getState().tasks, 't1')!;
    expect(t.category).toBe('daily');
    expect(t.repeat).toMatchObject({ freq: 'day', interval: 1 });
    expect(new Date(t.dueAt!).getHours()).toBe(9);
    // Shorthand still wins: a weekly repeat stays weekly.
    s.quickAdd('Review *weekly');
    expect(tk(store.getState().tasks, 't2')!.repeat).toMatchObject({ freq: 'week' });
    // ALL adds to MAIN, with no repeat.
    s.setCategoryTab('all');
    s.quickAdd('Ship it');
    expect(tk(store.getState().tasks, 't3')).toMatchObject({ category: 'main', repeat: null });
  });

  it('a new quest shows first; tabs filter the list and count open and done quests', () => {
    const { store, advance } = makeStore();
    const s = store.getState();
    s.setCategoryTab('misc');
    s.quickAdd('older');
    advance(1000);
    s.setCategoryTab('main');
    s.quickAdd('newer');
    const sel = makeSelectors();
    s.setCategoryTab('all');
    expect(sel.activeRows(store.getState()).map((r) => r.id)).toEqual(['t2', 't1']);
    s.setCategoryTab('misc');
    expect(sel.activeRows(store.getState()).map((r) => r.id)).toEqual(['t1']);
    expect(sel.tabCounts(store.getState())).toMatchObject({
      all: { active: 2, completed: 0 },
      main: { active: 1 },
      misc: { active: 1 },
      daily: { active: 0 },
    });
  });

  it('moving a quest to another category is one undo step; switching tabs leaves zoom', () => {
    const { store } = makeStore();
    const s = store.getState();
    const q = s.addTask(null, 'quest');
    s.setZoom(q);
    s.setQuestCategory(q, 'misc');
    expect(tk(store.getState().tasks, q)!.category).toBe('misc');
    expect(store.getState().toast?.message).toBe('MOVED TO MISC');
    s.undo();
    expect(tk(store.getState().tasks, q)!.category).toBeUndefined();
    s.setCategoryTab('daily');
    expect(store.getState().ui).toMatchObject({ category: 'daily', zoomRootId: null });
  });
});

describe('editing keeps the list still (bug 2026-10-09)', () => {
  it('the quest order is locked while editing and re-sorts when editing ends', () => {
    const { store, advance } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    advance(1000);
    const b = s.addTask(null, 'b');
    const sel = makeSelectors();
    const order = () => sel.activeRows(store.getState()).map((r) => r.id);
    expect(order()).toEqual([b, a]);
    // Editing "a": raising its priority (a structural change) doesn't move it yet.
    s.setEditing(a);
    s.cyclePriority(a);
    expect(order()).toEqual([b, a]);
    // Done editing: it takes its place (priority first).
    s.setEditing(null);
    expect(order()).toEqual([a, b]);
  });

  it('opening or closing a quest is not a change: it keeps its place', () => {
    const { store, advance } = makeStore();
    const s = store.getState();
    const a = s.addTask(null, 'a');
    s.addTask(a, 'child');
    advance(1000);
    const b = s.addTask(null, 'b');
    const sel = makeSelectors();
    const before = tk(store.getState().tasks, a)!.updatedAt;
    s.toggleCollapsed(a);
    expect(tk(store.getState().tasks, a)!.updatedAt).toBe(before);
    expect(sel.activeRows(store.getState()).map((r) => r.id)).toEqual([b, a]);
  });
});
