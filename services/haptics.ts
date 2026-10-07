/**
 * services/haptics.ts: the app's haptic vocabulary (PLAN §9.18).
 *
 * Layer: services (native side effects). Components call `haptics.check()`
 * and so on, and never expo-haptics directly, so the meaning of each
 * vibration lives in one place and the Settings toggle is respected
 * everywhere.
 *
 *   check / uncheck              light impact
 *   swipe passes its threshold   selection tick
 *   top-level task completed     success notification
 *   delete                       medium impact
 *
 * Haptics are fire-and-forget: they never block the UI, and a failure
 * (an unsupported device, haptics off in system settings) is ignored.
 */
import * as Haptics from 'expo-haptics';

let enabled = true;

/** Follows the "Haptics" setting (wired up in app/_layout.tsx). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Runs a haptic if enabled, swallowing any error. */
function play(run: () => Promise<void>): void {
  if (!enabled) return;
  run().catch(() => {});
}

export const haptics = {
  /** Checkbox checked or unchecked. */
  check: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A swipe crossed its commit threshold (either way). */
  tick: () => play(() => Haptics.selectionAsync()),
  /** A top-level task (or a whole group) is done. */
  success: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something went to Trash. */
  delete: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
