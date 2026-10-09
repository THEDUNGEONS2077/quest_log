/**
 * __tests__/components/DueSheet.test.tsx: amending a due date from the due
 * sheet (components/overlays/DueSheet.tsx, user request 2026-10-09).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DueSheet } from '@/components/overlays/DueSheet';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build, tk } from '../helpers/tree';

const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 10, 9, 12);

async function setup(dueAt: number | null) {
  const kv = createMemoryKV();
  saveTasks(kv, build([['dentist', { dueAt }]]));
  const store = createAppStore({ kv, now: () => NOW, newId: () => 'x' });
  const wrap = (children: ReactNode) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <StoreProvider value={bundleStore(store)}>{children}</StoreProvider>
    </SafeAreaProvider>
  );
  await render(wrap(<DueSheet />));
  await act(() => store.getState().openDueSheet('dentist'));
  return store;
}

describe('DueSheet amending', () => {
  it('shows AMEND for a dated task, and +1 DAY moves it a day, keeping the time', async () => {
    const store = await setup(at(2026, 10, 10, 15));
    expect(screen.getByText('AMEND')).toBeTruthy();
    expect(screen.getByText('CHANGE DATE…')).toBeTruthy();
    expect(screen.getByText('CHANGE TIME…')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('+1 DAY'));
    expect(tk(store.getState().tasks, 'dentist')!.dueAt).toBe(at(2026, 10, 11, 15));
    expect(store.getState().dueSheetFor).toBeNull(); // the sheet closed
  });

  it('+1 HOUR and +1 WEEK nudge from the current date', async () => {
    const store = await setup(at(2026, 10, 10, 15));
    await fireEvent.press(screen.getByLabelText('+1 HOUR'));
    expect(tk(store.getState().tasks, 'dentist')!.dueAt).toBe(at(2026, 10, 10, 16));
    await act(() => store.getState().openDueSheet('dentist'));
    await fireEvent.press(screen.getByLabelText('+1 WEEK'));
    expect(tk(store.getState().tasks, 'dentist')!.dueAt).toBe(at(2026, 10, 17, 16));
  });

  it('no AMEND section for a task without a date', async () => {
    await setup(null);
    expect(screen.queryByText('AMEND')).toBeNull();
  });
});
