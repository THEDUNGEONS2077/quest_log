/**
 * __tests__/components/editorFlicker.test.tsx: a long quest title doesn't
 * flicker while typing (bug 2026-10-15: past about three lines, the whole
 * title flashed on every keystroke).
 *
 *   - The quest title's editor has no textTransform: on an Android
 *     TextInput, the UPPERCASE transform rewrites the field's text on every
 *     keystroke.
 *   - The editor asks to keep the text in view only when its height really
 *     changes, not on every size report.
 * (Keeping it in view doesn't scroll for less than a point: keepInView.test.tsx.)
 */
import { act, render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { InlineEditor, useEditorFocus } from '@/components/edit/InlineEditor';
import { KeepInViewProvider } from '@/components/list/keepInView';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV } from '@/store/kv';
import { saveTasks } from '@/store/persist';
import { bundleStore, StoreProvider } from '@/store/react';

import { build } from '../helpers/tree';

function storeWrap(ensure = jest.fn()) {
  const kv = createMemoryKV();
  saveTasks(kv, build([['q', { title: 'a quest' }]]));
  const bundle = bundleStore(createAppStore({ kv, now: () => 1_000, newId: () => 'n' }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreProvider value={bundle}>
      <KeepInViewProvider value={{ ensure }}>{children}</KeepInViewProvider>
    </StoreProvider>
  );
  return { wrapper, ensure };
}

const sizeEvent = (height: number) => ({ nativeEvent: { contentSize: { width: 300, height } } }) as never;

it("a quest title's editor has no text transform (it shows as typed while editing)", async () => {
  const { wrapper } = storeWrap();
  const ui = await render(<InlineEditor id="q" title="a quest" variant="group" />, { wrapper });
  const style = StyleSheet.flatten(ui.getByLabelText('Task title').props.style);
  expect(style.textTransform).toBe('none');
  await ui.unmount(); // the field's keyboard helper stops with it
});

it('asks to keep the text in view only when its height changes', async () => {
  const { wrapper, ensure } = storeWrap();
  const { result, unmount } = await renderHook(() => useEditorFocus('q'), { wrapper });
  await act(() => result.current.onFocus());
  expect(ensure).toHaveBeenCalledTimes(1);
  await act(() => result.current.onContentSizeChange(sizeEvent(60)));
  expect(ensure).toHaveBeenCalledTimes(2);
  // The same height reported again (each keystroke on Android): nothing to do.
  await act(() => result.current.onContentSizeChange(sizeEvent(60)));
  await act(() => result.current.onContentSizeChange(sizeEvent(60.2)));
  expect(ensure).toHaveBeenCalledTimes(2);
  await act(() => result.current.onContentSizeChange(sizeEvent(80))); // a new line
  expect(ensure).toHaveBeenCalledTimes(3);
  await unmount();
});
