/**
 * components/edit/QuickAddBar.tsx: the always-there "new task" input at the
 * bottom of the ACTIVE tab (PLAN §9.4).
 *
 * Layer: UI. Pinned above the keyboard by KeyboardStickyView.
 *   - Idle, it reads `> new task█`.
 *   - Enter adds the task at the end of the current view and keeps the
 *     keyboard open for rapid entry. Enter on empty text closes it.
 *   - Pasting several lines adds one task per line, nested by indent.
 * Inline shorthand (!!!, @fri, …) is parsed here in Phase 6.
 */
import { useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TITLE_MAX } from '@/lib/paste';
import { useActions } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface Props {
  /** Reports the bar's height, so the list can leave room for it. */
  onHeight?: (height: number) => void;
}

export function QuickAddBar({ onHeight }: Props) {
  const actions = useActions();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const onChangeText = (next: string) => {
    // Enter never inserts a newline here, so a line break means a paste.
    if (next.includes('\n')) {
      actions.quickPaste(next);
      setText('');
    } else {
      setText(next);
    }
  };

  const input = useRef<TextInput>(null);

  const submit = () => {
    const title = text.trim();
    if (!title) {
      input.current?.blur(); // empty Enter: done adding
      return;
    }
    actions.quickAdd(title);
    setText(''); // keyboard stays open for the next task
  };

  return (
    // Sits at the bottom edge when the keyboard is closed and rides on top of
    // it when open. `opened` shifts it down by the safe-area inset, because
    // the keyboard already covers that strip.
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.sticky}>
      <View
        style={[styles.bar, { paddingBottom: space.sm + insets.bottom }]}
        onLayout={(e: LayoutChangeEvent) => onHeight?.(e.nativeEvent.layout.height)}
      >
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <Text style={[type.body, styles.prompt]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.prompt.glyph}
          </Text>
          <TextInput
            ref={input}
            value={text}
            onChangeText={onChangeText}
            onSubmitEditing={submit}
            onFocus={() => {
              setFocused(true);
              actions.setEditing(null); // only one editor at a time (PLAN §6.5)
            }}
            onBlur={() => setFocused(false)}
            placeholder={`new task${glyphs.cursor.glyph}`}
            placeholderTextColor={colors.textDim}
            multiline
            submitBehavior="submit"
            maxLength={TITLE_MAX}
            cursorColor={colors.accent}
            selectionColor={colors.accent}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            style={[type.body, styles.input]}
            accessibilityLabel="New task"
          />
        </View>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.bg },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  fieldFocused: { borderColor: colors.accent },
  prompt: { color: colors.accent, marginRight: space.sm, ...platformText },
  input: { flex: 1, color: colors.text, padding: 0, ...platformText },
});
