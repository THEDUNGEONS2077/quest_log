/**
 * __tests__/components/XpBar.test.tsx: the XP bar as a terminal gauge
 * (components/common/XpBar.tsx, aesthetic pass 2026-10-17).
 *
 *   - The lit share is whole cells only, and at least one cell as soon as
 *     anything is earned into the level.
 *   - The bar still reads as a progress bar (level, XP into the level).
 */
import { render, screen } from '@testing-library/react-native';

import { litShare, XP_CELLS, XpBar } from '@/components/common/XpBar';
import { levelInfo } from '@/lib/xp';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { bundleStore, StoreProvider } from '@/store/react';

describe('litShare', () => {
  const cell = 1 / XP_CELLS;

  it('lights nothing before any XP is earned into the level', () => {
    expect(litShare(0, 0)).toBe(0);
  });

  it('lights one cell for the first gain, however small', () => {
    expect(litShare(1, 1 / 500)).toBe(cell);
  });

  it('snaps down to whole cells', () => {
    expect(litShare(10, 0.2)).toBeCloseTo(4 * cell);
    expect(litShare(12, 0.24)).toBeCloseTo(4 * cell); // 4.8 cells: the fifth isn't earned yet
    expect(litShare(49, 0.98)).toBeCloseTo(19 * cell);
  });

  it('never lights more than the whole gauge', () => {
    expect(litShare(50, 1)).toBe(1);
  });
});

describe('XpBar', () => {
  it('reads as a progress bar: the level, and the XP into it', async () => {
    const store = createAppStore({ kv: createMemoryKV(), now: () => 1_000, newId: () => 'x' });
    store.setState({ tasks: { ...store.getState().tasks, progress: { ...store.getState().tasks.progress, xp: 10 } } });
    const { level, into, needed } = levelInfo(10);
    await render(
      <StoreProvider value={bundleStore(store)}>
        <XpBar />
      </StoreProvider>,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe(`Level ${level}: ${into} of ${needed} XP to level ${level + 1}`);
    expect(screen.getByText(`/${needed} XP`, { exact: false })).toBeTruthy();
  });
});
