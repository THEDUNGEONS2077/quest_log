/**
 * __tests__/components/Phosphor.test.tsx: the top panel's moving scanlines
 * (components/common/Phosphor.tsx, user request 2026-10-17): the lines
 * drift down in about one-pixel steps and the band passes every 7 s, as on
 * the desktop; both stay still under Reduce Motion, in the background and
 * while another screen covers the main one (battery). Elsewhere the lines
 * never move.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { AppState, PixelRatio } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import { Phosphor } from '@/components/common/Phosphor';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { bundleStore, StoreProvider } from '@/store/react';
import { SCAN_PITCH, timing } from '@/theme';

// The main screen is showing unless a test says otherwise.
jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const PANEL = 200;
// The layers are hidden from screen readers (decoration), so queries have to include hidden elements.
const hidden = { includeHiddenElements: true };
const BAND = PANEL * 0.45;

/** Renders the phosphor layer with the given settings; returns a rerender and the app-state listener. */
async function setup(props: { animated?: boolean } = { animated: true }, settings: Record<string, unknown> = { reduceMotion: 'off' }) {
  let appState: ((s: string) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appState = fn;
    return { remove: jest.fn() };
  }) as never);
  const kv = createMemoryKV({ 'settings.v1': JSON.stringify(settings) });
  const store = createAppStore({ kv, now: () => 1_000, newId: () => 'x' });
  const tree = () => (
    <StoreProvider value={bundleStore(store)}>
      <Phosphor {...props} />
    </StoreProvider>
  );
  const view = await render(tree());
  // The panel's size, as its layout reports it (the band's size and travel come from it).
  const lines = screen.queryByTestId('scanlines', hidden);
  if (lines) await act(async () => fireEvent(lines, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: PANEL } } }));
  return { rerender: () => view.rerender(tree()), appState: (s: string) => act(async () => appState?.(s)) };
}

/** A layer's offset now: its layout's top (0 if none) plus its translateY. */
const shift = (id: string) => {
  const style = getAnimatedStyle(screen.getByTestId(id, hidden)) as { top?: number; transform?: { translateY: number }[] };
  return (id === 'scanlines' ? 0 : (style.top ?? 0)) + (style.transform?.[0]?.translateY ?? 0);
};
const wait = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

// React Native's AppState mock has no state: the app starts in the foreground here.
const mockState = AppState.currentState;
beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(AppState, { currentState: 'active' });
  (useIsFocused as jest.Mock).mockReturnValue(true);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
afterAll(() => Object.assign(AppState, { currentState: mockState }));

it('drifts the lines down one pitch every 1.8 s, in steps of about a pixel', async () => {
  await setup();
  const step = SCAN_PITCH / Math.round(SCAN_PITCH * PixelRatio.get());
  const seen = new Set<number>();
  for (let t = 0; t < timing.scanDrift; t += 50) {
    await wait(50);
    seen.add(Number(shift('scanlines').toFixed(3)));
  }
  // Every position is a whole number of steps into the pitch, and the steps cover it.
  for (const y of seen) expect(Math.abs(y / step - Math.round(y / step))).toBeLessThan(1e-6);
  expect(seen.size).toBeGreaterThanOrEqual(Math.round(SCAN_PITCH * PixelRatio.get()));
  expect(Math.max(...seen)).toBeLessThanOrEqual(SCAN_PITCH);
});

it('passes the band down the panel every 7 s, out of sight in between', async () => {
  await setup();
  const hiddenAbove = BAND * -1.1;
  expect(shift('scan-band')).toBeCloseTo(hiddenAbove);
  await wait(timing.scanBandRest - 100);
  expect(shift('scan-band')).toBeCloseTo(hiddenAbove); // resting
  await wait(100 + timing.scanBandPass / 2);
  const mid = shift('scan-band');
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(PANEL); // over the panel
  await wait(timing.scanBandPass / 2 + 200);
  expect(shift('scan-band')).toBeCloseTo(hiddenAbove); // gone, resting again
  expect(timing.scanBandRest + timing.scanBandPass).toBe(7000); // the desktop's rhythm
});

it('stays still under Reduce Motion', async () => {
  await setup({ animated: true }, { reduceMotion: 'on' });
  await wait(timing.scanBandRest + timing.scanBandPass / 2);
  expect(shift('scanlines')).toBe(0);
  expect(shift('scan-band')).toBeCloseTo(BAND * -1.1);
});

it('stops in the background and while another screen covers the main one, and carries on after', async () => {
  const { rerender, appState } = await setup();
  await wait(600);
  // In the background: nothing moves.
  await appState('background');
  const still = shift('scanlines');
  await wait(timing.scanBandRest + timing.scanBandPass / 2);
  expect(shift('scanlines')).toBe(still);
  expect(shift('scan-band')).toBeCloseTo(BAND * -1.1);
  // Back: it drifts again.
  await appState('active');
  await wait(timing.scanDrift / 2);
  expect(shift('scanlines')).not.toBe(still);
  // Another screen on top: still again.
  (useIsFocused as jest.Mock).mockReturnValue(false);
  await rerender();
  const covered = shift('scanlines');
  await wait(timing.scanDrift);
  expect(shift('scanlines')).toBe(covered);
});

it('elsewhere (page headers, the boot screen) the lines never move', async () => {
  await setup({});
  expect(screen.queryByTestId('scanlines', hidden)).toBeNull();
  expect(screen.queryByTestId('scan-band', hidden)).toBeNull();
});
