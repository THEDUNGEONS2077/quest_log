/**
 * components/edit/InlineEditor.tsx: the single TextInput that edits a row's
 * title in place (PLAN §9.3, §6.5).
 *
 * Layer: UI. Only the row being edited mounts this component; every other
 * row is a plain <Text>, which keeps the list cheap. The editor contains no
 * rules: keys map to store actions, and the rules live in lib/outliner.ts.
 *
 *   typing         → updateTitle (one undo step per editing session)
 *   Enter          → pressEnter at the caret (new sibling / split / outdent)
 *   Backspace at 0 → pressBackspaceAtStart (delete empty / merge into the row above)
 *   paste with \n  → pasteIntoTask (one task per line, nested by indent)
 *   blur           → finishEditing (an untouched empty task is discarded)
 */
import { useEffect, useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet, TextInput, type TextInputKeyPressEventData } from 'react-native';

import { TITLE_MAX } from '@/lib/paste';
import { useActions, useStoreBundle } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

interface Props {
  id: string;
  title: string;
  /** Text style for the title (group headers use a different role). */
  variant: 'body' | 'group';
}

export function InlineEditor({ id, title, variant }: Props) {
  const actions = useActions();
  const { store, selectors } = useStoreBundle();
  const input = useRef<TextInput>(null);
  // The caret position, tracked without re-rendering (it changes on every keystroke).
  const caret = useRef({ start: title.length, end: title.length });

  // On mount: put the caret where the action that started editing asked
  // for it (for example, the join point after a merge), or at the end.
  useEffect(() => {
    const wanted = store.getState().editingCaret;
    const at = wanted === null ? title.length : Math.min(wanted, title.length);
    caret.current = { start: at, end: at };
    // Focus first, then place the caret, so the IME opens at the right spot.
    input.current?.focus();
    // setSelection is missing on some TextInput implementations (tests); optional call.
    input.current?.setSelection?.(at, at);
    // Only on mount: later caret moves come from the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The row shown directly above this one, for Backspace merges. */
  const previousRowId = (): string | null => {
    const rows = selectors.activeRows(store.getState());
    const i = rows.findIndex((r) => r.id === id);
    return i > 0 ? rows[i - 1]!.id : null;
  };

  const onChangeText = (text: string) => {
    // Enter never inserts a newline (submitBehavior="submit"), so a line
    // break can only come from a paste.
    if (text.includes('\n')) actions.pasteIntoTask(id, text);
    else actions.updateTitle(id, text.slice(0, TITLE_MAX));
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const { start, end } = caret.current;
    if (e.nativeEvent.key === 'Backspace' && start === 0 && end === 0) {
      actions.pressBackspaceAtStart(id, previousRowId());
    }
  };

  return (
    <TextInput
      ref={input}
      value={title}
      onChangeText={onChangeText}
      onSelectionChange={(e) => (caret.current = e.nativeEvent.selection)}
      onKeyPress={onKeyPress}
      onSubmitEditing={() => actions.pressEnter(id, caret.current.start)}
      onBlur={() => actions.finishEditing(id)}
      // Multiline so long titles wrap; "submit" makes Enter run onSubmitEditing
      // without inserting a newline or closing the keyboard.
      multiline
      submitBehavior="submit"
      maxLength={TITLE_MAX}
      // Themed native caret (PLAN §2: reliable with selection, autocorrect and IME).
      cursorColor={colors.accent}
      selectionColor={colors.accent}
      selectionHandleColor={colors.accent}
      autoCorrect
      autoCapitalize="sentences"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.input, variant === 'group' ? [type.group, { color: colors.textBright }] : type.body]}
      accessibilityLabel="Task title"
    />
  );
}

const styles = StyleSheet.create({
  // No padding or margins: the editor must line up exactly with the Text it replaces.
  input: { flex: 1, color: colors.text, padding: 0, margin: 0, textAlignVertical: 'top', ...platformText },
});
