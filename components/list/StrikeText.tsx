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
 * task's state animates. At rest it's plain text (struck: with plain
 * segments); the animated version is built only for a change, so opening a
 * list builds none of it (responsiveness pass 2026-10-18).
 */
import { type ReactNode, useEffect, useState } from 'react';
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
  // The first change of `struck` on the same task builds the animated version (`live`), which
  // then follows every later change from wherever it is: a quick second tap turns the line
  // around mid-draw. A row the list reuses for another task goes back to plain and jumps to its
  // state, and so does mounting (the previous-props pattern).
  const [seen, setSeen] = useState({ id, struck, live: false });
  let live = seen.live;
  if (seen.id !== id) {
    live = false;
    setSeen({ id, struck, live });
  } else if (seen.struck !== struck) {
    live = true;
    setSeen({ id, struck, live });
  }
  // The text's lines, measured only when there's a strike to draw: struck, or one playing
  // (responsiveness pass 2026-10-18: every title measured itself and drew a segment per line,
  // and re-rendered with them, though most are never struck while on screen).
  const [lines, setLines] = useState<Line[]>([]);
  const onTextLayout =
    struck || live
      ?(e: NativeSyntheticEvent<TextLayoutEventData>) => setLines(e.nativeEvent.lines.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height })))
      : undefined;

  const content = highlight ? (
    <>
      {[...text].slice(0, highlight.start).join('')}
      <Text style={styles.match}>{[...text].slice(highlight.start, highlight.end).join('')}</Text>
      {[...text].slice(highlight.end).join('')}
    </>
  ) : (
    text
  );

  if (live) {
    return (
      <StrikePlay struck={struck} color={color} style={style} lines={lines} onTextLayout={onTextLayout} onPress={onPress} onLongPress={onLongPress}>
        {content}
      </StrikePlay>
    );
  }
  // At rest: plain text in its final color, and (struck) the segments drawn full width.
  return (
    <View>
      <Text
        style={[style, styles.text, { color: struck ? colors.textDim : color }]}
        onTextLayout={onTextLayout}
        onPress={onPress}
        onLongPress={onLongPress}
        suppressHighlighting
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {content}
      </Text>
      {struck && lines.map((line, i) => <View key={i} pointerEvents="none" style={[styles.segment, segmentPlace(line), { width: line.width }]} />)}
    </View>
  );
}

interface PlayProps {
  struck: boolean;
  color: string;
  style: TextStyle | TextStyle[];
  lines: Line[];
  onTextLayout?: (e: NativeSyntheticEvent<TextLayoutEventData>) => void;
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
}

/**
 * The animated strike: it mounts on a change, drawing in (or out) from the other state to
 * `struck`, then follows each later change from where the line is.
 */
function StrikePlay({ struck, color, style, lines, onTextLayout, onPress, onLongPress, children }: PlayProps) {
  // 0 = plain, 1 = fully struck. It starts from the state before the change that built it.
  const progress = useSharedValue(struck ? 0 : 1);
  useEffect(() => {
    progress.set(withTiming(struck ? 1 : 0, { duration: duration.base, easing }));
  }, [struck, progress]);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [color, colors.textDim]),
  }));

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
        {children}
      </Animated.Text>
      {/* One segment per wrapped line, drawn through the middle of the line. */}
      {lines.map((line, i) => (
        <StrikeSegment key={i} line={line} progress={progress} />
      ))}
    </View>
  );
}

/** Where a line's segment sits: through the middle of the line. */
function segmentPlace(line: Line) {
  return { left: line.x, top: line.y + line.height / 2 - shape.strike / 2 };
}

function StrikeSegment({ line, progress }: { line: Line; progress: ReturnType<typeof useSharedValue<number>> }) {
  const style = useAnimatedStyle(() => ({ width: line.width * progress.get() }));
  return <Animated.View pointerEvents="none" style={[styles.segment, segmentPlace(line), style]} />;
}

const styles = StyleSheet.create({
  text: { ...platformText },
  match: { color: colors.accent, textDecorationLine: 'underline' },
  segment: { position: 'absolute', height: shape.strike, backgroundColor: colors.accent },
});
