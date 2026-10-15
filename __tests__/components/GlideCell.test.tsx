/**
 * __tests__/components/GlideCell.test.tsx: FlashList cells glide only while
 * the list's glide is on, and never when they've been recycled for another
 * row during it (components/list/GlideCell.tsx, smooth-exit fix 2026-10-15).
 *
 * The transition itself runs natively; here we check which cells carry it
 * (the `layout` prop on the cell's Animated.View).
 */
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { GlideCell } from '@/components/list/GlideCell';
import type { Row } from '@/lib/flatten';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { bundleStore, StoreProvider } from '@/store/react';

/** Stands in for the row FlashList renders inside a cell (GlideCell reads its `row` prop). */
function FakeRow({ row }: { row: Row }) {
  return <Text>{row.id}</Text>;
}
const rowFor = (id: string): Row => ({ id, depth: 0, hasChildren: false, progress: { done: 0, total: 0 } });

async function setup() {
  const store = createAppStore({ kv: createMemoryKV(), now: () => 1_000, newId: () => 'x' });
  const wrap = (children: ReactNode) => <StoreProvider value={bundleStore(store)}>{children}</StoreProvider>;
  const cell = (id: string) => wrap(<GlideCell testID="cell">{[<FakeRow key="r" row={rowFor(id)} />, null]}</GlideCell>);
  const ui = await render(cell('a'));
  /** Whether the cell currently carries the glide transition. */
  const glides = () => typeof ui.getByTestId('cell').props.layout === 'function';
  return { store, ui, cell, glides };
}

it('carries the glide only while the list glides', async () => {
  const { store, glides } = await setup();
  expect(glides()).toBe(false);
  await act(() => store.setState({ glide: true }));
  expect(glides()).toBe(true);
  await act(() => store.setState({ glide: false }));
  expect(glides()).toBe(false);
});

it('a cell recycled for another row during the glide jumps instead (until the glide ends)', async () => {
  const { store, ui, cell, glides } = await setup();
  await act(() => store.setState({ glide: true }));
  expect(glides()).toBe(true);
  await ui.rerender(cell('b')); // FlashList gave this cell another row
  expect(glides()).toBe(false);
  await act(() => store.setState({ glide: false }));
  await act(() => store.setState({ glide: true }));
  expect(glides()).toBe(true); // a new glide: it may glide again
});
