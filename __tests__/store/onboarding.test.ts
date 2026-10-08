/**
 * __tests__/store/onboarding.test.ts: first-run tips, What's new marker,
 * example tasks, the quick-add focus request and retired-key cleanup
 * (store/onboarding.ts, store/createStore.ts, lib/sample.ts).
 */
import { childIds } from '@/lib/tree';
import { taskCount } from '@/lib/taskMap';
import { createAppStore, installPersistence } from '@/store/createStore';
import { createMemoryKV, KEYS } from '@/store/kv';
import { nextTip, TIPS } from '@/store/onboarding';

import { build, tk } from '../helpers/tree';

/** A store over in-memory storage with IDs t1, t2, …. */
function makeStore(kv = createMemoryKV()) {
  let n = 0;
  const store = createAppStore({ kv, now: () => 1_000, newId: () => `t${++n}` });
  return { store, kv };
}

const ctx = (nodes: Parameters<typeof build>[0], editing = false, swipeActions = true) => ({ tasks: build(nodes), editing, swipeActions });

describe('nextTip', () => {
  it('waits for a task before the first tip', () => {
    expect(nextTip([], ctx([]))).toBeNull();
    expect(nextTip([], ctx([['a']]))?.id).toBe('tap-edit');
  });

  it('shows tips strictly in order, each when its moment comes', () => {
    // "enter" is next, but only while editing.
    expect(nextTip(['tap-edit'], ctx([['a'], ['b']]))).toBeNull();
    expect(nextTip(['tap-edit'], ctx([['a']], true))?.id).toBe('enter');
    // "hold" needs two open top-level tasks.
    expect(nextTip(['tap-edit', 'enter'], ctx([['a']]))).toBeNull();
    expect(nextTip(['tap-edit', 'enter'], ctx([['a'], ['b']]))?.id).toBe('hold');
    expect(nextTip(['tap-edit', 'enter', 'hold'], ctx([['a']]))?.id).toBe('swipe');
  });

  it('skips nothing once all are seen, and the swipe tip needs swipes on', () => {
    expect(nextTip(['tap-edit', 'enter', 'hold'], ctx([['a']], false, false))).toBeNull();
    expect(
      nextTip(
        TIPS.map((t) => t.id),
        ctx([['a']]),
      ),
    ).toBeNull();
  });

  it('ignores done and deleted top-level tasks', () => {
    expect(
      nextTip(
        [],
        ctx([
          ['a', { done: true }],
          ['b', { deletedAt: 5 }],
        ]),
      ),
    ).toBeNull();
  });
});

describe('onboarding actions', () => {
  it('shows a tip once, as a toast, and persists it as seen', () => {
    const { store, kv } = makeStore();
    const persistence = installPersistence(store, kv);
    const s = store.getState();
    s.showTip(TIPS[0]!);
    expect(store.getState().toast?.message).toBe(TIPS[0]!.message);
    s.dismissToast(store.getState().toast!.key);
    s.showTip(TIPS[0]!);
    expect(store.getState().toast).toBeNull(); // already seen
    persistence.flush();
    expect(JSON.parse(kv.getString(KEYS.onboarding)!)).toEqual({ tipsSeen: ['tap-edit'], lastSeenBuild: null });

    // A new launch remembers it.
    expect(makeStore(kv).store.getState().onboarding.tipsSeen).toEqual(['tap-edit']);
    persistence(); // stop
  });

  it("records the last build whose What's new was shown", () => {
    const { store } = makeStore();
    store.getState().markWhatsNewSeen(16);
    expect(store.getState().onboarding.lastSeenBuild).toBe(16);
  });

  it('loads the example tasks as one undoable step, after existing tasks', () => {
    const { store } = makeStore();
    const s = store.getState();
    const mine = s.addTask(null, 'mine');
    s.loadExampleTasks();
    const top = childIds(store.getState().tasks, null);
    expect(top[0]).toBe(mine);
    expect(top.map((id) => tk(store.getState().tasks, id)!.title)).toEqual([
      'mine',
      'Welcome to quest_log',
      'Groceries',
      'Call the bank',
      'Plan the weekend',
    ]);
    // A done subtask and a note come through the outline format.
    const welcome = childIds(store.getState().tasks, top[1]!);
    expect(tk(store.getState().tasks, welcome[0]!)!.done).toBe(true);
    expect(tk(store.getState().tasks, top[3]!)!.notes).toBe('Ask about the new card');
    expect(store.getState().toast).toMatchObject({ message: 'EXAMPLE TASKS ADDED', undo: true });

    s.undo();
    expect(taskCount(store.getState().tasks)).toBe(1);
  });

  it('requestQuickAdd leaves other modes, switches to ACTIVE and bumps the focus request', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.addTask(null, 'a');
    s.setEditing(id);
    s.setTab('completed');
    s.requestQuickAdd();
    const after = store.getState();
    expect(after.editingId).toBeNull();
    expect(after.ui.tab).toBe('active');
    expect(after.quickAddFocus).toBe(1);
  });
});

describe('retired keys', () => {
  it('deletes data earlier versions left behind (the removed widget) at startup', () => {
    const kv = createMemoryKV({ 'widget.snapshot': '{"v":1,"tasks":[]}' });
    const { store } = makeStore(kv);
    const stop = installPersistence(store, kv);
    expect(kv.getString('widget.snapshot')).toBeUndefined();
    stop();
  });
});
