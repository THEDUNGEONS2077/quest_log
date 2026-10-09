/**
 * components/edit/useOwnedText.ts: lets a TextInput own its text while the
 * user types, instead of having the stored value written back into it on
 * every keystroke.
 *
 * Layer: UI.
 *
 * Why (bug 2026-10-09, "@1pm became @1p1pm"): with a *controlled* input
 * (`value={…}`), each keystroke goes to the store and the stored text is
 * written back into the native field. Android keyboards with word
 * suggestions (Samsung, Gboard) compose a word as you type; if that
 * write-back lands mid-word, the field is reset to the old text just as the
 * keyboard commits its suggestion, and the suggestion is appended instead
 * of replacing: "@1p" + "1pm" → "@1p1pm".
 *
 * So inputs are uncontrolled, and the text is pushed into the field only
 * when the stored value changed from *outside* the typing (UNDO, a paste
 * split into tasks, shorthand applied). That remounts the input with the
 * new text: `key={epoch}`; editors refocus on a new epoch.
 *
 * `initial` must be the field's defaultValue, never the live stored value:
 * on Android, React Native sends defaultValue to the native field on every
 * render, exactly like `value` (TextInput.js passes `text={value ??
 * defaultValue}`), so a live defaultValue writes back on every keystroke
 * too. (That was the first, incomplete fix in v1.2.1.) `initial` changes
 * only together with `epoch`.
 *
 *   const { epoch, initial, typed } = useOwnedText(storedValue);
 *   <TextInput key={epoch} defaultValue={initial}
 *     onChangeText={(t) => { typed(t); save(t); }} />
 */
import { useState } from 'react';

export function useOwnedText(stored: string): { epoch: number; initial: string; typed: (text: string) => void } {
  // The stored value at the last render, and the text the user last typed into the field.
  const [prevStored, setPrevStored] = useState(stored);
  const [lastTyped, setLastTyped] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  // The field's starting text: fixed while typing, replaced only with a new epoch.
  const [initial, setInitial] = useState(stored);
  // The stored text changed, and not to what was just typed: an outside change.
  // (Order-proof: the field's report and the store's update may render in either
  // order.) Adjusting state during render is React's pattern for this.
  if (stored !== prevStored) {
    setPrevStored(stored);
    if (stored !== lastTyped) {
      setEpoch((e) => e + 1);
      setInitial(stored);
    }
  }
  return { epoch, initial, typed: setLastTyped };
}
