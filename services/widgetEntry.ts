/**
 * services/widgetEntry.ts: registers the widget's headless task handler
 * (PLAN §11.3).
 *
 * Layer: services. Kept apart from services/widget.tsx so the entry file
 * loads only the handler; the handler itself loads the store lazily, and
 * only for a tap. Android only (the iOS widget is Phase 15).
 */
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from '@/widgets/android/widgetTaskHandler';

/** Registers the widget handler on Android; does nothing elsewhere. */
export function registerWidget(): void {
  if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
}
