/**
 * components/common/keyboard.tsx: keyboard-aware building blocks, native
 * version (the web version is keyboard.web.tsx).
 *
 * Layer: UI. Native apps use react-native-keyboard-controller, which tracks
 * the keyboard frame by frame. Components import from here, never from the
 * library, so the web build can swap in its own versions.
 */
export { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';
