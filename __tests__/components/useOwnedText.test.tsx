/**
 * __tests__/components/useOwnedText.test.tsx: text fields own their text
 * while typing (components/edit/useOwnedText.ts). Bug 2026-10-09: writing
 * the stored value back on every keystroke broke Android keyboard
 * suggestions ("@1pm" → "@1p1pm").
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useOwnedText } from '@/components/edit/useOwnedText';
import { TaskRow } from '@/components/list/TaskRow';
import { findTask } from '@/lib/taskMap';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build } from '../helpers/tree';

describe('useOwnedText', () => {
  it('typing never pushes text back into the field (the epoch stays)', async () => {
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useOwnedText(stored), {
      initialProps: { stored: 'Call' },
    });
    // Each keystroke: the field reports the text, then the store saves the same text.
    for (const t of ['Call @', 'Call @1', 'Call @1p', 'Call @1pm']) {
      await act(() => result.current.typed(t));
      await rerender({ stored: t });
    }
    expect(result.current.epoch).toBe(0);
  });

  it('an outside change (undo, shorthand applied, paste split) replaces the field once', async () => {
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useOwnedText(stored), {
      initialProps: { stored: 'Call @1pm' },
    });
    await rerender({ stored: 'Call' }); // e.g. UNDO
    expect(result.current.epoch).toBe(1);
    await rerender({ stored: 'Call' });
    expect(result.current.epoch).toBe(1); // no repeat for the same text
  });
});

describe('the task title editor while typing', () => {
  it('never writes text back into the native field: no value, and a defaultValue that stays fixed', async () => {
    const kv = createMemoryKV();
    saveTasks(kv, build([['call', { title: 'Call' }]]));
    const store = createAppStore({ kv, now: () => 1_000, newId: () => 'x' });
    const bundle = bundleStore(store);
    const row = bundle.selectors.activeRows(store.getState())[0]!;
    await render(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
      >
        <StoreProvider value={bundle}>
          <TaskRow row={row} />
        </StoreProvider>
      </SafeAreaProvider>,
    );
    await act(() => store.getState().setEditing('call'));
    const field = () => screen.getByLabelText('Task title');
    // Typed letter by letter, as a keyboard reports it.
    for (const t of ['Call ', 'Call @', 'Call @1', 'Call @1p', 'Call @1pm']) {
      await fireEvent.changeText(field(), t);
      expect(field().props.value).toBeUndefined();
      expect(field().props.defaultValue).toBe('Call');
    }
    // The store still gets every keystroke.
    expect(findTask(store.getState().tasks, 'call')!.title).toBe('Call @1pm');
  });
});
