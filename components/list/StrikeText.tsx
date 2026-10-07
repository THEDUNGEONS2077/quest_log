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
 * with no animation.
 */
import { useEffect, useRef, useState } from 'react';
import { type NativeSyntheticEvent, StyleSheet, type TextLayoutEventData, type TextStyle, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape } from '@/theme';

interface Props {
  text: string;
  struck: boolean;
  /** Undone text color (struck text fades to textDim). */
  color: string;
  style: TextStyle | TextStyle[];
  onPress?: () => void;
}

/** One measured text line: where to draw its strike segment. */
interface Line {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function StrikeText({ text, struck, color, style, onPress }: Props) {
  // 0 = plain, 1 = fully struck. Starts at the final state: mounting isn't a change.
  const progress = useSharedValue(struck ? 1 : 0);
  const mounted = useRef(false);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    progress.value = withTiming(struck ? 1 : 0, { duration: duration.base, easing });
  }, [struck, progress]);

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
        suppressHighlighting
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {text}
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
  segment: { position: 'absolute', height: shape.strike, backgroundColor: colors.accent },
});
