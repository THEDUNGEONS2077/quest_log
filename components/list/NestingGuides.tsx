/**
 * components/list/NestingGuides.tsx: thin vertical lines, one per depth
 * level, that show a row's nesting (PLAN §9.2).
 *
 * Layer: UI. Pure presentation: draws `levels` hairlines at the indent
 * positions, spanning the row's full height.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, shape, size, space } from '@/theme';

/** Horizontal position of guide `i` (centred under the caret column of level i). */
export function guideX(i: number): number {
  return space.lg + i * size.indent + size.caretColumn / 2 - shape.hairline;
}

export const NestingGuides = memo(function NestingGuides({ levels }: { levels: number }) {
  if (levels <= 0) return null;
  return (
    <>
      {Array.from({ length: levels }, (_, i) => (
        <View key={i} style={[styles.guide, { left: guideX(i) }]} />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  guide: { position: 'absolute', top: 0, bottom: 0, width: shape.hairline, backgroundColor: colors.line },
});
