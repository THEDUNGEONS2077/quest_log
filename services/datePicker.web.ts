/**
 * services/datePicker.web.ts: date and time pickers for the web build /
 * iPhone PWA (native version: datePicker.ts).
 *
 * Layer: services (browser boundary). Uses the browser's own picker, via a
 * hidden <input type="datetime-local"> or <input type="time">: on an iPhone
 * that's the familiar iOS wheel. The input is added to the page (inside the
 * open sheet, if any) only while the picker is open. It must be focused during the user's tap, which is
 * why callers open it straight from the button's press handler.
 */

/** The browser has a picker everywhere the web build runs. */
export const hasDialogPicker = true;

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-08T14:30" in local time, the format datetime-local inputs use. */
export function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "2026-10-08T14:30" or "14:30" (on `base`'s date) as local time; null if empty or malformed. */
export function fromLocalInputValue(value: string, base: Date): Date | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (full) return new Date(+full[1]!, +full[2]! - 1, +full[3]!, +full[4]!, +full[5]!);
  const time = /^(\d{2}):(\d{2})/.exec(value);
  if (time) {
    const d = new Date(base);
    d.setHours(+time[1]!, +time[2]!, 0, 0);
    return d;
  }
  return null;
}

/** Opens a temporary input of `type` with `value`; resolves its value when the picker closes (null if cancelled). */
function openInput(type: 'datetime-local' | 'time', value: string, min?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    if (min) input.min = min;
    // Present (so it can be focused) but invisible; 16px so iOS doesn't zoom the page.
    Object.assign(input.style, { position: 'fixed', bottom: '0', left: '0', opacity: '0', fontSize: '16px', width: '1px', height: '1px' });
    // Inside the open sheet, if any: React Native Web's modals trap focus, and an
    // input outside the modal would lose focus at once (which reads as "cancel").
    const modals = document.querySelectorAll('[aria-modal="true"]');
    (modals[modals.length - 1] ?? document.body).appendChild(input);

    let done = false;
    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(result);
    };
    // Desktop and Android browsers confirm with "change"; iOS confirms by closing the wheel (blur).
    input.addEventListener('change', () => finish(input.value || null));
    input.addEventListener('blur', () => finish(input.value && input.value !== value ? input.value : null));

    input.focus();
    try {
      input.showPicker();
    } catch {
      input.click(); // older browsers: focusing/clicking opens the picker
    }
  });
}

/** Asks for a time of day. Resolves the chosen time (on `initial`'s date), or null if cancelled. */
export async function pickTime(initial: Date): Promise<Date | null> {
  const v = await openInput('time', `${pad(initial.getHours())}:${pad(initial.getMinutes())}`);
  return v ? fromLocalInputValue(v, initial) : null;
}

/** Asks for a date and time. Resolves the chosen moment, or null if cancelled. */
export async function pickDateTime(initial: Date, minimumDate?: Date): Promise<Date | null> {
  const v = await openInput('datetime-local', toLocalInputValue(initial), minimumDate ? toLocalInputValue(minimumDate) : undefined);
  return v ? fromLocalInputValue(v, initial) : null;
}
