/**
 * components/common/keyboard.web.tsx: keyboard-aware building blocks for the
 * web build / iPhone PWA (native version: keyboard.tsx).
 *
 * Layer: UI. Mobile Safari doesn't shrink the page when the on-screen
 * keyboard opens: it covers the bottom of the page. The visual viewport
 * (window.visualViewport) is the part still visible, so
 *   keyboard inset = layout height - (visible height + visible top offset).
 * KeyboardStickyView lifts its content by that inset, so the quick-add bar
 * and the editing toolbar sit just above the keyboard, as on Android.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

/** How much of the bottom of the page the keyboard covers, in px (0 when closed). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** Web needs no provider (the native library does); kept so the layout is the same on every platform. */
export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

interface StickyProps {
  /** Same shape as the native component; on web only `opened` is used (added while the keyboard is up). */
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Content that rides just above the on-screen keyboard. */
export function KeyboardStickyView({ offset, style, children }: StickyProps) {
  const inset = useKeyboardInset();
  // The native `opened` offset compensates for the safe-area strip the keyboard covers; same here.
  const lift = inset > 0 ? inset - (offset?.opened ?? 0) : -(offset?.closed ?? 0);
  return <View style={[style, { transform: [{ translateY: -Math.max(0, lift) }] }]}>{children}</View>;
}
