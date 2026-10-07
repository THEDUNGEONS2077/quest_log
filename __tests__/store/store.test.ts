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
