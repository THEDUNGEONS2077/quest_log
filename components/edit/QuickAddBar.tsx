/**
 * components/edit/QuickAddBar.tsx: the always-there "new task" input at the
 * bottom of the ACTIVE tab (PLAN §9.4).
 *
 * Layer: UI. Pinned above the keyboard by KeyboardStickyView.
 *   - Idle, it reads `> new task█`, with the shared blinking block cursor.
 *   - It takes focus when asked (`quickAddFocus`: the app icon's "New
 *     task" shortcut, and the first launch).
 *   - Enter adds the task at the end of the current view, then closes the
 *     keyboard (user request 2026-10-08). Enter on empty text closes it too.
 *   - Pasting several lines adds one task per line, nested by indent.
 *   - Shorthand (!!! @fri // notes, #Group) shows as live chips above the
 *     field and becomes task fields on Enter (lib/parser.ts).
 *   - After `#Group`, new tasks go inside that group; an `IN: GROUP ✕`
 *     chip shows the target and clears it.
 */
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from '@/components/common/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockCursor } from '@/components/common/BlockCursor';
import { ShorthandChips, useShorthand } from '@/components/edit/ParsedChips';
import { isEnterInsert, TITLE_MAX } from '@/lib/paste';
import { findTask } from '@/lib/taskMap';
import { useActions, useAppStore } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface Props {
  /** Reports the bar's height, so the list can leave room for it. */
  onHeight?: (height: number) => void;
}

/** The last `quickAddFocus` request acted on (module-wide: survives remounts). */
let handledFocus = 0;

export function QuickAddBar({ onHeight }: Props) {
  const actions = useActions();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const parsed = useShorthand(text);
  // The #Group target's title, if quick-add is currently adding into a group.
  const target = useAppStore((s) => (s.quickAddParent ? (findTask(s.tasks, s.quickAddParent)?.title ?? null) : null));

  const onChangeText = (next: string) => {
    // One line break added to the same text = Enter (the web build inserts it
    // instead of submitting): add the task. Any other line break = a paste.
    if (isEnterInsert(text, next)) {
      submit();
      return;
    }
    if (next.includes('\n')) {
      actions.quickPaste(next);
      setText('');
    } else {
      setText(next);
    }
  };

  const input = useRef<TextInput>(null);

  // Focus when asked: each request once, even if it came in before this bar was
  // on screen (the bar remounts after editing, which must not re-focus it).
  const focusRequest = useAppStore((s) => s.quickAddFocus);
  useEffect(() => {
    if (focusRequest === handledFocus) return;
    handledFocus = focusRequest;
    // After this frame's layout, so the keyboard opens under a placed bar.
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [focusRequest]);

  const submit = () => {
    const title = text.trim();
    if (!title) {
      input.current?.blur(); // empty Enter: done adding
      return;
    }
    actions.quickAdd(title);
    setText('');
    input.current?.blur(); // done: the keyboard goes away after each added task
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
        {/* Group target and shorthand preview, above the field. */}
        {target !== null && (
          <View style={styles.targetRow}>
            <Text style={[type.meta, styles.target]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`IN: ${target.toUpperCase()}`}
            </Text>
            <Pressable
              onPress={actions.clearQuickAddParent}
              hitSlop={space.md}
              accessibilityRole="button"
              accessibilityLabel="Stop adding into this group"
            >
              <Text style={[type.metaGlyph, styles.targetClear]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {glyphs.delete.glyph}
              </Text>
            </Pressable>
          </View>
        )}
        <ShorthandChips result={parsed} style={styles.chips} />
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <Text style={[type.glyph, styles.prompt]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.prompt.glyph}
          </Text>
          <View style={styles.inputWrap}>
            {/* Idle: "new task█" with a blinking cursor (a placeholder can't blink). */}
            {!focused && text === '' && (
              <Text
                style={[type.body, styles.idle]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              >
                new task
                <BlockCursor color={colors.textDim} />
              </Text>
            )}
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
  chips: { marginTop: 0, marginBottom: space.sm },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  target: { color: colors.accent, flexShrink: 1, ...platformText },
  targetClear: { color: colors.text, paddingHorizontal: space.sm, ...platformText },
  prompt: { color: colors.accent, marginRight: space.sm, ...platformText },
  inputWrap: { flex: 1, justifyContent: 'center' },
  input: { color: colors.text, padding: 0, ...platformText },
  // Exactly where the input's text starts; touches pass through to the input.
  idle: { position: 'absolute', left: 0, color: colors.textDim, ...platformText },
});
