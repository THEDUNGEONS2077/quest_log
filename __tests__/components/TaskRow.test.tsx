/**
 * __tests__/components/TaskRow.test.tsx: row rendering and the Phase 4
 * exit criterion "no stray re-renders" (PLAN §16).
 *
 * Each row is wrapped in a React <Profiler>, which reports every render of
 * its subtree. Typing in one row must re-render only that row.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Profiler, type ReactNode } from 'react';

import { TaskRow } from '@/components/list/TaskRow';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build, tk } from '../helpers/tree';

/** A store with three top-level tasks and a group, over in-memory storage. */
async function setup() {
  const kv = createMemoryKV();
  saveTasks(kv, build([['a'], ['b'], ['c'], ['g', [['g1']]]]));
  let n = 0;
  const store = createAppStore({ kv, now: () => 1_000, newId: () => `new${++n}` });
  const bundle = bundleStore(store);
  const renders: Record<string, number> = {};
  const wrap = (children: ReactNode) => <StoreProvider value={bundle}>{children}</StoreProvider>;
  const rows = bundle.selectors.activeRows(store.getState());
  const ui = await render(
    wrap(
      rows.map((row) => (
        <Profiler key={row.id} id={row.id} onRender={(id) => (renders[id] = (renders[id] ?? 0) + 1)}>
          <TaskRow row={row} />
        </Profiler>
      )),
    ),
  );
  return { store, renders, ui };
}

describe('TaskRow', () => {
  it('renders titles, a group header and its progress', async () => {
    await setup();
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('g')).toBeTruthy();
    expect(screen.getByText('[0/1]')).toBeTruthy();
  });

  it('typing in one row re-renders only that row', async () => {
    const { store, renders } = await setup();
    await act(() => {
      store.getState().setEditing('b');
    });
    // Baseline after editing started (that legitimately re-renders b).
    const before = { ...renders };
    await act(() => {
      store.getState().updateTitle('b', 'bravo');
      store.getState().updateTitle('b', 'bravo!');
    });
    expect(tk(store.getState().tasks, 'b')!.title).toBe('bravo!');
    // Only "b" rendered again; a, c and g did not.
    expect(renders.a).toBe(before.a);
    expect(renders.c).toBe(before.c);
    expect(renders.g).toBe(before.g);
    expect(renders.b!).toBeGreaterThan(before.b!);
  });

  it('tapping a title starts editing that row, with an input showing its text', async () => {
    const { store } = await setup();
    await fireEvent.press(screen.getByText('c'));
    expect(store.getState().editingId).toBe('c');
    expect(screen.getByDisplayValue('c')).toBeTruthy();
  });

  it('Enter/Done saves and stops editing; it never creates a task', async () => {
    const { store } = await setup();
    await act(() => store.getState().setEditing('a'));
    await fireEvent(screen.getByDisplayValue('a'), 'submitEditing');
    const { editingId, tasks } = store.getState();
    expect(editingId).toBeNull();
    expect(tasks.children.root).toEqual(['a', 'b', 'c', 'g']);
  });

  it('Backspace on an empty task deletes it and stops editing', async () => {
    const { store } = await setup();
    await act(() => store.getState().setEditing('b'));
    await fireEvent.changeText(screen.getByDisplayValue('b'), '');
    await fireEvent(screen.getByDisplayValue(''), 'keyPress', { nativeEvent: { key: 'Backspace' } });
    const { editingId, tasks } = store.getState();
    expect(editingId).toBeNull();
    expect(tasks.children.root).toEqual(['a', 'c', 'g']);
  });

  it('a pasted multi-line text becomes several tasks', async () => {
    const { store } = await setup();
    await act(() => store.getState().setEditing('c'));
    await fireEvent.changeText(screen.getByDisplayValue('c'), 'c\nd\n  d1');
    const { tasks } = store.getState();
    expect(tasks.children.root).toEqual(['a', 'b', 'c', 'new1', 'g']);
    expect(tk(tasks, 'new2')!.parentId).toBe('new1');
  });

  it('tapping the checkbox checks the task', async () => {
    const { store } = await setup();
    const boxes = screen.getAllByRole('checkbox');
    await fireEvent.press(boxes[0]!); // row "a"
    expect(tk(store.getState().tasks, 'a')!.done).toBe(true);
  });

  it('group headers have a "+" that adds a subtask and starts editing it', async () => {
    const { store } = await setup();
    await fireEvent.press(screen.getByLabelText('Add subtask to g'));
    const { editingId, tasks } = store.getState();
    expect(tasks.children.g).toEqual(['g1', editingId]);
    expect(tk(tasks, editingId!)!.parentId).toBe('g');
  });

  it('only group headers get the "+" (plain tasks use the toolbar or menu)', async () => {
    await setup();
    expect(screen.queryByLabelText('Add subtask to a')).toBeNull();
  });

  it('screen-reader actions cover the row operations', async () => {
    const { store } = await setup();
    const row = screen.getByLabelText(/^b, not done/);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'indent' } });
    expect(tk(store.getState().tasks, 'b')!.parentId).toBe('a');
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'priority' } });
    expect(tk(store.getState().tasks, 'b')!.priority).toBe(1);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'due' } });
    expect(store.getState().dueSheetFor).toBe('b');
  });
});
