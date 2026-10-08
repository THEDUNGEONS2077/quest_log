/**
 * components/list/useKeyboardHeight.web.ts: the on-screen keyboard's height
 * on the web build / iPhone PWA (native version: useKeyboardHeight.ts).
 *
 * Layer: UI. React Native Web's Keyboard events don't fire for the browser's
 * keyboard, so this measures it from the visual viewport instead
 * (components/common/keyboard.web.tsx).
 */
export { useKeyboardInset as useKeyboardHeight } from '@/components/common/keyboard.web';
