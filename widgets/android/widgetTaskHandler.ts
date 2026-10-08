/**
 * widgets/android/widgetTaskHandler.ts: the widget's headless task
 * (PLAN §11.2, §11.3, §6.4).
 *
 * Layer: widget glue. Android starts this JS (with or without the app's
 * UI) when a widget is placed, resized, due for its 30-minute redraw, or
 * tapped.
 *
 * Drawing only reads the small snapshot, so a periodic redraw never loads
 * the task tree. A tap on [ ] (COMPLETE):
 *   1. draws the widget without that task straight away (optimistic),
 *   2. appends the action to `ops.pending` (never lost, even if killed),
 *   3. loads the store and drains the queue: the same rules as in the app
 *      (cascade, auto-complete, repeat advance), one undo step with a
 *      "COMPLETED FROM WIDGET · UNDO" toast,
 *   4. saves right away, re-syncs reminders (a repeating task's next one),
 *      and writes a fresh snapshot and redraws.
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { withoutTask } from '@/lib/widget';
import { appendExternalOp, drainExternalOps } from '@/services/externalOps';
import { readSnapshot, refreshWidget, renderQuestWidget, writeSnapshot } from '@/services/widget';
import { createAppKV } from '@/store/mmkv';

import { COMPLETE_ACTION } from './QuestWidget';

/** Handles every widget event (registered in index.ts). */
export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  clickAction,
  clickActionData,
  renderWidget,
}: WidgetTaskHandlerProps): Promise<void> {
  // Lightweight storage handle: enough to read the snapshot without hydrating the store.
  const kv = createAppKV();

  if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_RESIZED') {
    renderWidget(renderQuestWidget(readSnapshot(kv), widgetInfo));
    return;
  }
  if (widgetAction !== 'WIDGET_CLICK' || clickAction !== COMPLETE_ACTION) return;

  const taskId = clickActionData?.id;
  if (typeof taskId !== 'string') return;
  const dueAt = typeof clickActionData?.dueAt === 'number' ? clickActionData.dueAt : undefined;

  // 1. Instant feedback: the row disappears.
  const snapshot = readSnapshot(kv);
  if (snapshot) {
    const optimistic = withoutTask(snapshot, taskId);
    writeSnapshot(kv, optimistic);
    renderWidget(renderQuestWidget(optimistic, widgetInfo));
  }

  // 2. Queue first, so the action survives anything that happens next.
  appendExternalOp(kv, { kind: 'complete', taskId, at: Date.now(), source: 'widget', dueAt });

  // 3–4. Load the store only now (it hydrates from MMKV when first loaded), and the
  // notification service with it; a plain redraw never pays for either.
  /* eslint-disable @typescript-eslint/no-require-imports -- deliberate lazy loads (see above) */
  const { appStore, flushPersistence, kv: appKv } = require('@/store') as typeof import('@/store');
  const { syncReminders } = require('@/services/notifications') as typeof import('@/services/notifications');
  /* eslint-enable @typescript-eslint/no-require-imports */
  drainExternalOps(appKv, appStore);
  flushPersistence();
  await syncReminders(() => appStore.getState().tasks);
  await refreshWidget(appStore, appKv);
}
