/**
 * components/edit/NotesField.tsx: a task's optional notes (PLAN §9.7, §12.4).
 *
 * Layer: UI. Two parts:
 *   - NotesEditor: the multiline input shown under the title while editing
 *     notes. It grows up to 8 lines, then scrolls. Enter makes a new line;
 *     DONE, back or tapping elsewhere finishes.
 *   - NotesView: notes shown under the title in view mode (tap ≡ on the
 *     row). URLs are tappable and open in the system browser, which needs no
 *     app permission (PLAN §3). Tapping the text edits it.
 *
 * Empty notes leave no trace: nothing is rendered.
 */
import { useEffect, useRef } from 'react';
import { Linking, StyleSheet, Text, TextInput } from 'react-native';

import { useActions } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

import { useEditorFocus } from './InlineEditor';

/** Max notes length (PLAN §9.3). */
export const NOTES_MAX = 10_000;
/** The editor grows to this many lines, then scrolls (PLAN §12.4). */
const MAX_LINES = 8;

export function NotesEditor({ id, notes }: { id: string; notes: string }) {
  const actions = useActions();
  const focus = useEditorFocus(id);
  const input = useRef<TextInput>(null);

  // Focus on mount, caret at the end (continue writing).
  useEffect(() => {
    input.current?.focus();
    input.current?.setSelection?.(notes.length, notes.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextInput
      ref={input}
      value={notes}
      onChangeText={(text) => actions.updateNotes(id, text.slice(0, NOTES_MAX))}
      onFocus={focus.onFocus}
      onContentSizeChange={focus.onContentSizeChange}
      onBlur={focus.onBlur}
      multiline
      submitBehavior="newline"
      maxLength={NOTES_MAX}
      placeholder="notes…"
      placeholderTextColor={colors.textDim}
      cursorColor={colors.accent}
      selectionColor={colors.accent}
      selectionHandleColor={colors.accent}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[type.notes, styles.editor, { maxHeight: type.notes.lineHeight * MAX_LINES }]}
      accessibilityLabel="Task notes"
    />
  );
}

// http(s) links, up to the next whitespace; trailing punctuation is left out of the link.
const URL = /(https?:\/\/[^\s]+?)(?=[.,;:!?)\]]*(?:\s|$))/g;

/** Splits notes into plain and link segments. Exported for tests. */
export function linkSegments(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1]!, url: m[1]! });
    last = m.index + m[1]!.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function NotesView({ notes, onEdit }: { notes: string; onEdit: () => void }) {
  if (!notes) return null;
  return (
    <Text style={[type.notes, styles.view]} onPress={onEdit} suppressHighlighting maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {linkSegments(notes).map((seg, i) =>
        seg.url ? (
          <Text
            key={i}
            style={styles.link}
            onPress={() => Linking.openURL(seg.url!).catch(() => {})}
            accessibilityRole="link"
            suppressHighlighting
          >
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  editor: { color: colors.textDim, padding: 0, marginTop: space.xs, textAlignVertical: 'top', ...platformText },
  view: { color: colors.textDim, marginTop: space.xs, ...platformText },
  link: { color: colors.accent, textDecorationLine: 'underline' },
});
