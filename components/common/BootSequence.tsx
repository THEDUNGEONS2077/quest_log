/**
 * components/common/BootSequence.tsx: the terminal boot screen
 * (PLAN §10.1, §12.9).
 *
 *   > quest_log v0.10.0
 *   > MOUNTING /quests ......... OK
 *   > 12 ACTIVE · 1 OVERDUE
 *   > READY█
 *                tap to skip
 *
 * Layer: UI. <BootGate> wraps the app's screens and lays the boot screen
 * over them, so the app is already rendered underneath and ready the moment
 * it fades (it never delays startup). Rules:
 *   - cold start only (once per JS process),
 *   - lines type at 8 ms per character, hold briefly, then fade in 160 ms,
 *   - a tap skips it,
 *   - never shown with Reduce Motion, with the "Boot sequence" setting off,
 *     or when the app icon's "New quest" shortcut opened the app.
 *
 * useBooting() tells the main screen when the boot screen is up, so things
 * like first-run tips and What's new wait until it has gone.
 */
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appVersion } from '@/services/appInfo';
import { launchedFromShortcut } from '@/services/quickActions';
import { useAppStore, useSelectors } from '@/store/react';
import { colors, easing, glyphs, maxFontSizeMultiplier, platformText, space, timing, type } from '@/theme';

import { BlockCursor } from './BlockCursor';
import { useReduceMotion } from './motion';
import { useMinute } from './useMinute';

/** Typing speed (PLAN §10.1). */
const MS_PER_CHAR = 8;
/** Typing runs on a frame-ish tick, several characters per tick. */
const TICK_MS = 16;
/** How long the finished screen stays before fading. */
const HOLD_MS = 350;

/** Set once the boot screen has been decided for this JS process (cold start only). */
let decided = false;

/** Tests only: makes the next <BootGate> behave like a fresh cold start. */
export function resetBootForTests(): void {
  decided = false;
}

const BootContext = createContext(false);

/** True while the boot screen covers the app. */
export function useBooting(): boolean {
  return useContext(BootContext);
}

/** Wraps the app's screens; shows the boot screen over them on a cold start. */
export function BootGate({ children }: { children: ReactNode }) {
  const enabled = useAppStore((s) => s.settings.bootSequence);
  const reduce = useReduceMotion();
  // Decided on the first render only: settings changed later don't replay it.
  const [booting, setBooting] = useState(() => !decided && enabled && !reduce && !launchedFromShortcut());
  useEffect(() => {
    decided = true;
  }, []);

  return (
    <BootContext.Provider value={booting}>
      {children}
      {booting && <BootScreen onDone={() => setBooting(false)} />}
    </BootContext.Provider>
  );
}

function BootScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const selectors = useSelectors();
  const now = useMinute();
  const counts = useAppStore((s) => selectors.counts(s, now));
  const lines = [
    `${glyphs.prompt.glyph} quest_log v${appVersion()}`,
    `${glyphs.prompt.glyph} MOUNTING /quests ......... OK`,
    `${glyphs.prompt.glyph} ${counts.active} ACTIVE${counts.overdue ? ` · ${counts.overdue} OVERDUE` : ''}`,
    `${glyphs.prompt.glyph} READY`,
  ];
  const total = lines.reduce((n, l) => n + l.length, 0);

  // Characters typed so far, across all lines.
  const [typed, setTyped] = useState(0);
  const opacity = useSharedValue(1);
  const [leaving, setLeaving] = useState(false);

  // Type the lines, a few characters per tick.
  useEffect(() => {
    if (leaving) return;
    const t = setInterval(() => setTyped((n) => Math.min(total, n + TICK_MS / MS_PER_CHAR)), TICK_MS);
    return () => clearInterval(t);
  }, [total, leaving]);

  // Finished typing: hold, then leave.
  const done = typed >= total;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setLeaving(true), HOLD_MS);
    return () => clearTimeout(t);
  }, [done]);

  // Leaving (finished, or tapped): fade out, then unmount.
  useEffect(() => {
    if (!leaving) return;
    opacity.set(withTiming(0, { duration: timing.bootFade, easing }));
    const t = setTimeout(onDone, timing.bootFade);
    return () => clearTimeout(t);
  }, [leaving, opacity, onDone]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  // Slice the typed characters into the lines; the cursor sits after the last one.
  let left = typed;
  const shown = lines.map((l) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length;
    return part;
  });
  let last = 0;
  shown.forEach((l, i) => {
    if (l.length > 0) last = i;
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, fade]}>
      <Pressable
        style={[styles.press, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}
        onPress={() => setLeaving(true)}
        accessibilityRole="button"
        accessibilityLabel="quest_log is starting. Double tap to skip."
        accessibilityViewIsModal
      >
        <View>
          {shown.map((l, i) => (
            <Text key={i} style={[type.body, styles.line]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {l}
              {i === last && <BlockCursor />}
            </Text>
          ))}
        </View>
        <Text style={[type.meta, styles.skip]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          tap to skip
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  press: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.lg },
  line: { color: colors.accent, ...platformText },
  skip: { color: colors.textDim, textAlign: 'center', ...platformText },
});
