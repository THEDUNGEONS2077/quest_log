/**
 * services/notificationTask.web.ts: nothing to register on the web.
 *
 * Layer: services. The native module defines a background task for the
 * DONE / SNOOZE buttons on reminders; the web build has no reminders
 * (services/notifications.web.ts), so importing this module does nothing.
 */
export {};
