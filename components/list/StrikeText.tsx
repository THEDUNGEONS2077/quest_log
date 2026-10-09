/**
 * components/list/StrikeText.tsx: a task title that can be struck through,
 * with an animated line (PLAN §9.5, §10.3).
 *
 * Layer: UI. When `struck` turns true, a 1.5 pt accent line draws left to
 * right over each text line (200 ms) while the text fades to textDim.
 * Turning false reverses it. Line positions come from onTextLayout, so
 * wrapped titles get one segment per line. Everything animates on the UI
 * thread, and Reanimated skips animations when the OS Reduce Motion
 * setting is on (PLAN §8.3).
 *
 * Rows that mount already done (scrolling, relaunch) show the final state
 * with no animation, and so does a row the list reuses for another task
 * (FlashList recycles rows while scrolling): only a change of the same
 * task's state animates.
 */
import { useEffect, useRef, useState } from 'react';
import { type NativeSyntheticEvent, StyleSheet, Text, type TextLayoutEventData, type TextStyle, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape } from '@/theme';

interface Props {
  /** The task shown: a different one means the row was reused, not checked. */
  id: string;
  text: string;
  struck: boolean;
  /** Undone text color (struck text fades to textDim). */
  color: string;
  style: TextStyle | TextStyle[];
  onPress?: () => void;
  onLongPress?: () => void;
  /** Characters to highlight in accent (a search match), as [start, end). */
  highlight?: { start: number; end: number } | null;
}

/** One measured text line: where to draw its strike segment. */
interface Line {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function StrikeText({ id, text, struck, color, style, onPress, onLongPress, highlight }: Props) {
  // 0 = plain, 1 = fully struck. Starts at the final state: mounting isn't a change.
  const progress = useSharedValue(struck ? 1 : 0);
  const shown = useRef({ id, struck });
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const before = shown.current;
    shown.current = { id, struck };
    if (before.id !== id)
      progress.value = struck ? 1 : 0; // reused for another task: jump
    else if (before.struck !== struck) progress.value = withTiming(struck ? 1 : 0, { duration: duration.base, easing });
  }, [id, struck, progress]);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [color, colors.textDim]),
  }));

  const onTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    setLines(e.nativeEvent.lines.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height })));
  };

  return (
    <View>
      <Animated.Text
        style={[style, styles.text, textStyle]}
        onTextLayout={onTextLayout}
        onPress={onPress}
        onLongPress={onLongPress}
        suppressHighlighting
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {highlight ? (
          <>
            {[...text].slice(0, highlight.start).join('')}
            <Text style={styles.match}>{[...text].slice(highlight.start, highlight.end).join('')}</Text>
            {[...text].slice(highlight.end).join('')}
          </>
        ) : (
          text
        )}
      </Animated.Text>
      {/* One segment per wrapped line, drawn through the middle of the line. */}
      {lines.map((line, i) => (
        <StrikeSegment key={i} line={line} progress={progress} />
      ))}
    </View>
  );
}

function StrikeSegment({ line, progress }: { line: Line; progress: ReturnType<typeof useSharedValue<number>> }) {
  const style = useAnimatedStyle(() => ({ width: line.width * progress.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.segment, { left: line.x, top: line.y + line.height / 2 - shape.strike / 2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  text: { ...platformText },
  match: { color: colors.accent, textDecorationLine: 'underline' },
  segment: { position: 'absolute', height: shape.strike, backgroundColor: colors.accent },
});
