/**
 * __tests__/widgets/widgetTaskHandler.test.ts: the widget's headless task
 * (widgets/android/widgetTaskHandler.ts): drawing from the snapshot, and a
 * [ ] tap completing the task through the ops queue.
 */
import { Platform } from 'react-native';

import { findTask } from '@/lib/taskMap';
import { buildSnapshot } from '@/lib/widget';
import { createAppStore } from '@/store/createStore';
import { createMemoryKV, KEYS } from '@/store/kv';
import { saveTasks } from '@/store/persist';

import { build } from '../helpers/tree';

// One in-mockMemory storage shared by the "MMKV" handle and the app store.
const mockMemory = createMemoryKV();
saveTasks(mockMemory, build([['a'], ['b', { priority: 3 }]]));
const mockAppStore = createAppStore({ kv: mockMemory, now: () => Date.now(), newId: () => 'x' });

jest.mock('expo-linking', () => ({ createURL: (path: string) => `questlog://${path}` }));
jest.mock('react-native-android-widget', () => ({
  FlexWidget: () => null,
  TextWidget: () => null,
  requestWidgetUpdate: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/store/mmkv', () => ({ createAppKV: () => mockMemory }));
// Getters: the factory runs when the handler first imports the module, after these exist.
jest.mock('@/store', () => ({
  get appStore() {
    return mockAppStore;
  },
  get kv() {
    return mockMemory;
  },
  flushPersistence: jest.fn(),
}));
jest.mock('@/services/notifications', () => ({ syncReminders: jest.fn(() => Promise.resolve()) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { widgetTaskHandler } = require('@/widgets/android/widgetTaskHandler') as typeof import('@/widgets/android/widgetTaskHandler');

const info = {
  widgetName: 'QuestWidget',
  widgetId: 1,
  width: 320,
  height: 180,
  screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 3, densityDpi: 480 },
};

beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

it('draws from the stored snapshot on update', async () => {
  mockMemory.set(KEYS.widgetSnapshot, JSON.stringify(buildSnapshot(mockAppStore.getState().tasks, Date.now())));
  const renderWidget = jest.fn();
  await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_UPDATE', renderWidget });
  const el = renderWidget.mock.calls[0][0];
  expect(el.props.snapshot.tasks.map((t: { id: string }) => t.id)).toEqual(['b', 'a']);
  expect(el.props.height).toBe(180);
});

it('a [ ] tap hides the row at once, then completes the task as one undoable step', async () => {
  mockMemory.set(KEYS.widgetSnapshot, JSON.stringify(buildSnapshot(mockAppStore.getState().tasks, Date.now())));
  const renderWidget = jest.fn();
  await widgetTaskHandler({
    widgetInfo: info,
    widgetAction: 'WIDGET_CLICK',
    clickAction: 'COMPLETE',
    clickActionData: { id: 'b' },
    renderWidget,
  });

  // Optimistic draw without "b".
  expect(renderWidget.mock.calls[0][0].props.snapshot.tasks.map((t: { id: string }) => t.id)).toEqual(['a']);
  // Applied through the queue, which is then empty.
  expect(findTask(mockAppStore.getState().tasks, 'b')!.done).toBe(true);
  expect(mockMemory.getString(KEYS.opsPending)).toBeUndefined();
  expect(mockAppStore.getState().toast).toMatchObject({ message: 'COMPLETED FROM WIDGET', undo: true });
  // A fresh snapshot was written from the store.
  expect(JSON.parse(mockMemory.getString(KEYS.widgetSnapshot)!).tasks.map((t: { id: string }) => t.id)).toEqual(['a']);

  mockAppStore.getState().undo();
  expect(findTask(mockAppStore.getState().tasks, 'b')!.done).toBe(false);
});

it('ignores taps without a task id', async () => {
  const renderWidget = jest.fn();
  await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_CLICK', clickAction: 'COMPLETE', clickActionData: {}, renderWidget });
  expect(renderWidget).not.toHaveBeenCalled();
});
