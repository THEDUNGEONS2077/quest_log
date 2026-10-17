/**
 * components/common/Rule.tsx: the chrome's rules (aesthetic pass 2026-10-17).
 *
 *   SETTINGS ─────────────────────────────          ← Rule: runs on from a heading, fading out
 *   ─────────━━━━━━━━━━━━━━━━━─────────              ← LitEdge: lit in the middle, over a hairline
 *
 * Layer: UI. Gradients from theme/effects.ts. A LitEdge lies over a view's
 * own hairline border (top or bottom), so if gradients ever didn't draw,
 * the plain hairline would still be there.
 */
import { StyleSheet, View } from 'react-native';

import { backgroundStyle, effects, shape } from '@/theme';

/** A heading's rule: fills the rest of its row, fading out (lit for an accent heading). */
export function Rule({ lit = false }: { lit?: boolean }) {
  return <View style={[styles.rule, backgroundStyle(lit ? effects.fadeRuleLit : effects.fadeRule)]} accessible={false} />;
}

/** A lit rule over the parent's top or bottom hairline (the parent must not clip it). */
export function LitEdge({ at }: { at: 'top' | 'bottom' }) {
  return <View pointerEvents="none" style={[styles.edge, at === 'top' ? styles.top : styles.bottom, backgroundStyle(effects.litRule)]} />;
}

const styles = StyleSheet.create({
  rule: { flex: 1, height: shape.hairline, alignSelf: 'center' },
  // Exactly over the parent's hairline border (absolute children sit inside the border).
  edge: { position: 'absolute', left: 0, right: 0, height: shape.hairline },
  top: { top: -shape.hairline },
  bottom: { bottom: -shape.hairline },
});
