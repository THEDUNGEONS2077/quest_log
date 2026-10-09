/**
 * __tests__/components/NotesField.test.tsx: notes links and notes editing on a row.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { linkSegments } from '@/components/edit/NotesField';
import { TaskRow } from '@/components/list/TaskRow';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build, tk } from '../helpers/tree';

describe('linkSegments', () => {
  it('splits out http(s) links, leaving trailing punctuation as text', () => {
    expect(linkSegments('see https://a.io/x, then http://b.io.')).toEqual([
      { text: 'see ' },
      { text: 'https://a.io/x', url: 'https://a.io/x' },
      { text: ', then ' },
      { text: 'http://b.io', url: 'http://b.io' },
      { text: '.' },
    ]);
  });
  it('returns plain text unchanged', () => {
    expect(linkSegments('no links here')).toEqual([{ text: 'no links here' }]);
  });
});

/**
 * Renders the row of subtask "a" (inside quest "q") over an in-memory store.
 * A subtask: quests show "+" (add an objective) where subtasks show "+ NOTE".
 */
async function renderRow(fields = {}) {
  const kv = createMemoryKV();
  saveTasks(kv, build([['q', [['a', fields]]]]));
  const store = createAppStore({ kv, now: () => 1_000, newId: () => 'x' });
  const bundle = bundleStore(store);
  const row = bundle.selectors.activeRows(store.getState()).find((r) => r.id === 'a');
  await render(
    <StoreProvider value={bundle}>
      <TaskRow row={row!} />
    </StoreProvider>,
  );
  return store;
}

describe('notes on a row', () => {
  it('shows "+ NOTE" while editing a title without notes, and it opens the notes editor', async () => {
    const store = await renderRow();
    await act(() => store.getState().setEditing('a'));
    await fireEvent.press(screen.getByText('+ NOTE'));
    expect(store.getState().editingField).toBe('notes');
    await fireEvent.changeText(screen.getByLabelText('Task notes'), 'line one');
    expect(tk(store.getState().tasks, 'a')!.notes).toBe('line one');
  });

  it('tapping ≡ shows the notes in view mode', async () => {
    const store = await renderRow({ notes: 'hidden detail' });
    expect(screen.queryByText('hidden detail')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Show or hide notes'));
    expect(store.getState().expandedNotes).toEqual(['a']);
    expect(screen.getByText('hidden detail')).toBeTruthy();
  });

  it('shows live shorthand chips while editing the title', async () => {
    const store = await renderRow();
    await act(() => store.getState().setEditing('a'));
    await fireEvent.changeText(screen.getByDisplayValue('a'), 'a !!!');
    expect(screen.getByText('!!! HIGH')).toBeTruthy();
  });
});
