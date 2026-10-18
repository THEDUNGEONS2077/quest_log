/**
 * __tests__/components/StrikeText.test.tsx: the struck-through title
 * (components/list/StrikeText.tsx; responsiveness pass 2026-10-18). At rest
 * it's plain text: an open title doesn't measure its lines or draw
 * segments; a struck one draws one full-width segment per line. A change of
 * the same task's state builds the animated version, which then follows
 * later changes from where its line is; a row reused for another task just
 * shows its state.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { StrikeText } from '@/components/list/StrikeText';
import { colors, shape } from '@/theme';

/** Two wrapped lines, as onTextLayout reports them. */
const LINES = {
  nativeEvent: {
    lines: [
      { x: 0, y: 0, width: 120, height: 20, ascender: 15, capHeight: 10, descender: 5, text: 'Ship the ', xHeight: 8 },
      { x: 0, y: 20, width: 60, height: 20, ascender: 15, capHeight: 10, descender: 5, text: 'report', xHeight: 8 },
    ],
  },
};

const title = (props: Partial<Parameters<typeof StrikeText>[0]> = {}) => (
  <StrikeText id="a" text="Ship the report" struck={false} color={colors.text} style={{}} {...props} />
);

/** The strike segments drawn: views one strike tall. */
function segments() {
  return screen.container.queryAll((n) => n.type === 'View' && StyleSheet.flatten(n.props.style)?.height === shape.strike);
}

it('an open title is plain text: no line measuring, no segments', async () => {
  await render(title());
  expect(screen.getByText('Ship the report').props.onTextLayout).toBeUndefined();
  expect(segments()).toHaveLength(0);
});

it('a title shown struck draws one full-width segment per line, once measured', async () => {
  await render(title({ struck: true }));
  await fireEvent(screen.getByText('Ship the report'), 'textLayout', LINES);
  const widths = segments().map((s) => StyleSheet.flatten(s.props.style).width);
  expect(widths).toEqual([120, 60]);
});

it('checking the same task builds the animated strike, which measures its lines', async () => {
  const view = await render(title());
  await view.rerender(title({ struck: true }));
  const text = screen.getByText('Ship the report');
  expect(text.props.onTextLayout).toBeDefined();
  await fireEvent(text, 'textLayout', LINES);
  expect(segments()).toHaveLength(2);
});

it('a row reused for another task (struck) shows its state without playing', async () => {
  const view = await render(title());
  await view.rerender(title({ id: 'b', struck: true }));
  await fireEvent(screen.getByText('Ship the report'), 'textLayout', LINES);
  // At rest: plain segments at full width (an animated one would start at 0).
  expect(segments().map((s) => StyleSheet.flatten(s.props.style).width)).toEqual([120, 60]);
});

it('unchecking mid-strike turns the same line around, without jumping to fully struck first', async () => {
  const view = await render(title());
  await view.rerender(title({ struck: true }));
  await fireEvent(screen.getByText('Ship the report'), 'textLayout', LINES);
  // No time has passed: the line had only just started drawing in.
  await view.rerender(title({ struck: false }));
  const widths = segments().map((s) => StyleSheet.flatten(s.props.style).width);
  expect(widths).toHaveLength(2);
  // A fresh draw-out would start from full width ([120, 60]); the line goes back from where it was.
  expect(widths).toEqual([0, 0]);
});
