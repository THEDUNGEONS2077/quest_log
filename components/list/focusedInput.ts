/**
 * components/list/focusedInput.ts: the text box that has keyboard focus,
 * native version (the web version is focusedInput.web.ts).
 *
 * Layer: UI. Used by keepInView.tsx to measure where typing happens.
 */
import { TextInput, type View } from 'react-native';

/** The focused text box, as a measurable view, or null. */
export function focusedInput(): View | null {
  return TextInput.State.currentlyFocusedInput() as unknown as View | null;
}
