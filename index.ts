/**
 * index.ts: the app's entry point (package.json "main").
 *
 * Layer: entry. Starts Expo Router as usual, and registers the home screen
 * widget's headless task. The widget handler must be registered here, at
 * load time and outside any screen, because Android may start the JS
 * runtime only to draw or update the widget, with no UI at all.
 */
import 'expo-router/entry';

import { registerWidget } from '@/services/widgetEntry';

registerWidget();
