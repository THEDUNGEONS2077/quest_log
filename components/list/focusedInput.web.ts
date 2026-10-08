/**
 * components/list/focusedInput.web.ts: the focused text box in the web
 * build / iPhone PWA (native version: focusedInput.ts).
 *
 * Layer: UI. React Native Web's TextInput.State has no
 * currentlyFocusedInput(); the browser's own document.activeElement is the
 * same element, and React Native Web gives host elements measureInWindow(),
 * so keepInView.tsx can measure it the same way.
 */
import type { View } from 'react-native';

/** The focused text box, as a measurable view, or null. */
export function focusedInput(): View | null {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return el && 'measureInWindow' in el ? (el as unknown as View) : null;
}
