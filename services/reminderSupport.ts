/**
 * services/reminderSupport.ts: can this platform show reminders? Native
 * version: yes (the web version, reminderSupport.web.ts, says no).
 *
 * Layer: services. Kept apart from notifications.ts so UI code can ask
 * without loading the notifications library.
 */
export const remindersAvailable = true;
