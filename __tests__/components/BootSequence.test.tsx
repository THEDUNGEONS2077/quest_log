/**
 * __tests__/components/BootSequence.test.tsx: the boot screen's rules
 * (PLAN §10.1): shown on a cold start, typed out, skippable, and never
 * shown with Reduce Motion or with the setting off.
 *
 * "Cold start only" is a module-level flag; each test resets it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootGate, resetBootForTests } from '@/components/common/BootSequence';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { bundleStore, StoreProvider } from '@/store/react';

/** Renders <BootGate> over a stand-in app screen, with the given settings. */
async function setup(settings: Record<string, unknown> = {}) {
  resetBootForTests();
  const kv = createMemoryKV({ 'settings.v1': JSON.stringify(settings) });
  const store = createAppStore({ kv, now: () => 1_000, newId: () => 'x' });
  const wrap = (children: ReactNode) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <StoreProvider value={bundleStore(store)}>{children}</StoreProvider>
    </SafeAreaProvider>
  );
  await render(
    wrap(
      <BootGate>
        <Text>APP</Text>
      </BootGate>,
    ),
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('BootSequence', () => {
  it('types the boot lines over the app, then fades away', async () => {
    await setup();
    expect(screen.getByText('APP')).toBeTruthy(); // the app renders underneath from the start
    await act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText(/MOUNTING \/quests/)).toBeTruthy();
    expect(screen.getByText(/0 ACTIVE/)).toBeTruthy();
    expect(screen.getByText(/READY/)).toBeTruthy();
    // Hold + fade, then it's gone.
    // (Each step's timer starts after the previous step's render, hence separate acts.)
    await act(() => jest.advanceTimersByTime(400));
    await act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByText(/READY/)).toBeNull();
  });

  it('a tap skips it', async () => {
    await setup();
    await act(() => jest.advanceTimersByTime(50));
    await fireEvent.press(screen.getByLabelText(/Double tap to skip/));
    await act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByLabelText(/Double tap to skip/)).toBeNull();
  });

  it('is never shown with Reduce Motion on', async () => {
    await setup({ reduceMotion: 'on' });
    expect(screen.queryByLabelText(/Double tap to skip/)).toBeNull();
    expect(screen.getByText('APP')).toBeTruthy();
  });

  it('is not shown with the setting off', async () => {
    await setup({ bootSequence: false });
    expect(screen.queryByLabelText(/Double tap to skip/)).toBeNull();
  });
});
