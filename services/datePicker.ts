/**
 * services/datePicker.ts: the system date and time pickers, native version
 * (the web version is datePicker.web.ts).
 *
 * Layer: services (native boundary: @react-native-community/datetimepicker).
 * Android opens the system dialogs: date, then time. iOS (native) has no
 * dialog API, so `hasDialogPicker` is false there and the caller shows an
 * inline picker instead (Phase 15).
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

/** True when pickDateTime/pickTime open a dialog on this platform. */
export const hasDialogPicker = Platform.OS === 'android';

/** Asks for a time of day. Resolves the chosen time (on today's date), or null if cancelled. */
export function pickTime(initial: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'time',
      is24Hour: true,
      onChange: (e, time) => resolve(e.type === 'set' && time ? time : null),
    });
  });
}

/** Asks for a day only. Resolves the chosen day (time of day as in `initial`), or null if cancelled. */
export function pickDate(initial: Date, minimumDate?: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate,
      onChange: (e, date) => resolve(e.type === 'set' && date ? date : null),
    });
  });
}

/** Asks for a date, then a time. Resolves the combined moment, or null if either was cancelled. */
export function pickDateTime(initial: Date, minimumDate?: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return resolve(null);
        void pickTime(initial).then((time) => {
          if (!time) return resolve(null);
          const d = new Date(date);
          d.setHours(time.getHours(), time.getMinutes(), 0, 0);
          resolve(d);
        });
      },
    });
  });
}
