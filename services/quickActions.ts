/**
 * services/quickActions.ts: the app icon's long-press shortcut,
 * "New task" (PLAN §9.20).
 *
 * Layer: services (native module boundary: expo-quick-actions, which uses
 * Android's ShortcutManager; on iOS, home screen quick actions).
 *
 * The shortcut is registered at runtime, so it appears from the first
 * launch on. Choosing it opens the app ready to type a new task, both
 * when that launches the app (the "initial" action) and when the app is
 * already running.
 */
import * as QuickActions from 'expo-quick-actions';

/** The one shortcut's ID. */
const NEW_TASK = 'new-task';

/** True when this launch came from the "New task" shortcut (the boot screen is skipped). */
export function launchedFromShortcut(): boolean {
  return QuickActions.initial?.id === NEW_TASK;
}

/**
 * Registers the shortcut and calls `onNewTask` whenever it's chosen.
 * Returns a function that stops listening.
 */
export function startQuickActions(onNewTask: () => void): () => void {
  // Android shows the app icon next to the label ("ic_launcher" mipmap).
  QuickActions.setItems([{ id: NEW_TASK, title: 'New task', icon: 'ic_launcher' }]).catch(() => {
    // No shortcut support (unusual launchers): the app works the same without it.
  });
  if (QuickActions.initial?.id === NEW_TASK) onNewTask();
  const sub = QuickActions.addListener((action) => {
    if (action.id === NEW_TASK) onNewTask();
  });
  return () => sub.remove();
}
