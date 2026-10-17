/**
 * components/common/Prompted.tsx: the terminal prompt `>` at the start of a
 * line, lit (aesthetic pass 2026-10-17): empty states, sheet titles, pages.
 *
 * Layer: UI. Nested inside the line's own <Text>, so it takes the line's
 * size and only changes the prompt's color: accent with the soft text glow,
 * like the quick-add bar's `>`.
 *
 *   <Text style={…}><Prompted>NO MATCHES.</Prompted></Text>
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, glowTextSoft, glyphs } from '@/theme';

/** `children` after a lit `>`. */
export function Prompted({ children }: { children: ReactNode }) {
  return (
    <>
      <Text style={styles.prompt}>{glyphs.prompt.glyph}</Text> {children}
    </>
  );
}

const styles = StyleSheet.create({
  prompt: { color: colors.accent, ...glowTextSoft },
});
