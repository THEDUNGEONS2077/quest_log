/**
 * store/settings.ts: user settings and their defaults (PLAN §9.17).
 *
 * Layer: store. Persisted as `settings.v1`. loadJSON fills in defaults for
 * missing fields, so adding a setting needs no migration.
 */

export interface Settings {
  // --- Behavior ---
  /** Turn on the notification when a due date is set (shorthand and picker). */
  notifyByDefault: boolean;
  /** Time used for day-only dates such as `@fri` (minutes after midnight; 540 = 09:00). */
  defaultTimeMinutes: number;
  swipeActions: boolean;
  /** Move completed tasks older than N days to Trash on launch. */
  autoClearCompleted: 'off' | 30 | 90;
  // --- Feel ---
  bootSequence: boolean;
  haptics: boolean;
  /** 'system' follows the OS Reduce Motion setting. */
  reduceMotion: 'system' | 'on' | 'off';
}

export const DEFAULT_SETTINGS: Settings = {
  notifyByDefault: true,
  defaultTimeMinutes: 9 * 60,
  swipeActions: true,
  autoClearCompleted: 'off',
  bootSequence: true,
  haptics: true,
  reduceMotion: 'system',
};
