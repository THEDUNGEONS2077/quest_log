/**
 * components/list/useKeyboardHeight.ts: the on-screen keyboard's height (0 when hidden).
 *
 * Layer: UI. Lists use it to pad their content while the keyboard is open,
 * so every row can scroll above it, and as the signal that the keyboard
 * has finished opening (to re-check that the typed text is in view).
 * Updates only on show/hide, not per animation frame.
 */
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
