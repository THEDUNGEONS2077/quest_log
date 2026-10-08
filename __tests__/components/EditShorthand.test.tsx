/**
 * __tests__/components/EditShorthand.test.tsx: shorthand when editing a task
 * that's already saved (user bug report, 2026-10-08).
 *
 * Simulates the real flow on a rendered row: tap the title, type, press
 * Done (submitEditing), and checks the saved task.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { TaskRow } from '@/components/list/TaskRow';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build, tk } from '../helpers/tree';

const NOW = new Date(2026, 9, 7, 12).getTime(); // Wed noon

/** One saved task rendered as a row; returns its store. */
async function savedTask(title: string, fields = {}) {
  const kv = createMemoryKV();
  saveTasks(kv, build([['t', { title, ...fields }]]));
  const store = createAppStore({ kv, now: () => NOW, newId: () => 'n' });
  const bundle = bundleStore(store);
  const [row] = bundle.selectors.activeRows(store.getState());
  await render(
    <StoreProvider value={bundle}>
      <TaskRow row={row!} />
    </StoreProvider>,
  );
  return store;
}

/** Tap the title, replace the text, press Done. */
async function editTo(oldTitle: string, newTitle: string) {
  await fireEvent.press(screen.getByText(oldTitle));
  await fireEvent.changeText(screen.getByDisplayValue(oldTitle), newTitle);
  await fireEvent(screen.getByDisplayValue(newTitle), 'submitEditing');
}

describe('shorthand while editing a saved task', () => {
  it('applies priority and date typed onto an existing title', async () => {
    const store = await savedTask('buy milk');
    await editTo('buy milk', 'buy milk !!! @fri');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'buy milk', priority: 3, dueAt: new Date(2026, 9, 9, 9).getTime() });
  });

  it('typing only shorthand keeps the task and its title (it used to delete the task)', async () => {
    const store = await savedTask('milk');
    await editTo('milk', '!!');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'milk', priority: 2 });
  });

  it('words that were already in the title stay literal (escaped earlier)', async () => {
    const store = await savedTask('email @fri');
    await editTo('email @fri', 'email @fri about lunch');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'email @fri about lunch', dueAt: null });
  });

  it('adding a repeat to a task that already has a date keeps that date', async () => {
    const due = new Date(2026, 9, 10, 18).getTime();
    const store = await savedTask('gym', { dueAt: due, notify: true });
    await editTo('gym', 'gym *mon,thu');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'gym', dueAt: due, repeat: { freq: 'week', weekdays: [1, 4] } });
  });

  it('// adds notes, and keeps existing notes', async () => {
    const store = await savedTask('trip', { notes: 'book early' });
    await editTo('trip', 'trip // window seat');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'trip', notes: 'book early\nwindow seat' });
  });

  it('a second edit session applies its own shorthand', async () => {
    const store = await savedTask('report');
    await editTo('report', 'report !');
    await act(async () => {}); // let the row re-render as a plain title
    await editTo('report', 'report @tomorrow');
    expect(tk(store.getState().tasks, 't')).toMatchObject({ title: 'report', priority: 1, dueAt: new Date(2026, 9, 8, 9).getTime() });
  });
});

describe('live chips while editing a saved task', () => {
  it('preview only newly typed shorthand', async () => {
    await savedTask('email @fri');
    await fireEvent.press(screen.getByText('email @fri'));
    await fireEvent.changeText(screen.getByDisplayValue('email @fri'), 'email @fri !!');
    expect(screen.getByText('!! MED')).toBeTruthy();
    expect(screen.queryByText(/FRI 09:00/)).toBeNull();
  });
});
