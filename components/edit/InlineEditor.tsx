/**
 * components/edit/InlineEditor.tsx: the single TextInput that edits a row's
 * title in place (PLAN §9.3, §6.5; revised 2026-10-07).
 *
 * Layer: UI. Only the row being edited mounts this component; every other
 * row is a plain <Text>. It contains no rules: keys map to store actions.
 *
 *   typing              → updateTitle (one undo step per editing session)
 *   Enter / Done        → finishEditing (save and close; never creates a task)
 *   Backspace when empty → backspaceOnEmpty (delete it, stop editing)
 *   paste with \n       → pasteIntoTask (one task per line, nested by indent)
 *   blur                → finishEditing, unless the same task's editor regains
 *                          focus right away (see onBlur)
 *
 * Structure while editing (OUT / IN / + SUB) comes from the EditToolbar.
 */
import { useEffect, useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet, TextInput, type TextInputKeyPressEventData } from 'react-native';

import { TITLE_MAX } from '@/lib/paste';
import { useKeepInView } from '@/components/list/keepInView';
import { type TitleVariant, titleStyles } from '@/components/list/titleStyle';
import { useActions, useStoreBundle } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText } from '@/theme';

/**
 * The task whose editor currently has focus (shared by the title and notes
 * editors). Indent/outdent moves the row, so its editor can unmount and
 * remount, and switching title ↔ notes moves focus within the row. The
 * editor that takes focus sets this, which tells the previous editor's blur
 * handler that editing hasn't really ended.
 */
let focusedEditorId: string | null = null;

/** How long a blur waits for the same task's editor to take focus again. */
const REFOCUS_GRACE_MS = 150;

/**
 * Focus/blur handlers shared by the row editors: blur finishes editing only
 * if no editor for the same task takes focus within the grace period.
 */
export function useEditorFocus(id: string) {
  const actions = useActions();
  const { store } = useStoreBundle();
  const keepInView = useKeepInView();
  return {
    onFocus: () => {
      focusedEditorId = id;
      // Whatever is being typed must be visible (keepInView.tsx).
      keepInView.ensure();
    },
    /** The text box grew (a new line): keep its bottom above the toolbar. */
    onContentSizeChange: () => keepInView.ensure(),
    onBlur: () => {
      focusedEditorId = null;
      setTimeout(() => {
        if (focusedEditorId === null && store.getState().editingId === id) actions.finishEditing(id);
      }, REFOCUS_GRACE_MS);
    },
  };
}

interface Props {
  id: string;
  title: string;
  /** Text style for the title (group headers use a different role). */
  variant: TitleVariant;
}

export function InlineEditor({ id, title, variant }: Props) {
  const actions = useActions();
  const { store } = useStoreBundle();
  const input = useRef<TextInput>(null);
  const caret = useRef({ start: title.length, end: title.length });

  // On mount: focus, and put the caret where the action asked (default: end).
  useEffect(() => {
    const wanted = store.getState().editingCaret;
    const at = wanted === null ? title.length : Math.min(wanted, title.length);
    caret.current = { start: at, end: at };
    input.current?.focus();
    // setSelection is missing on some TextInput implementations (tests); optional call.
    input.current?.setSelection?.(at, at);
    // Only on mount: later caret moves come from the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeText = (text: string) => {
    // Enter never inserts a newline (submitBehavior), so a line break means a paste.
    if (text.includes('\n')) actions.pasteIntoTask(id, text);
    else actions.updateTitle(id, text.slice(0, TITLE_MAX));
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    // Backspace in an empty title deletes the task. (Empty means the caret
    // can only be at 0, so no caret check is needed; that also avoids
    // relying on selection events arriving before the key event.)
    if (e.nativeEvent.key === 'Backspace' && title === '') actions.backspaceOnEmpty(id);
  };

  // Blur waits briefly: if this task's editor remounts (indent/outdent moved
  // the row) or the notes field takes focus, editing continues.
  const focus = useEditorFocus(id);

  return (
    <TextInput
      ref={input}
      value={title}
      onChangeText={onChangeText}
      onSelectionChange={(e) => (caret.current = e.nativeEvent.selection)}
      onKeyPress={onKeyPress}
      onFocus={focus.onFocus}
      onContentSizeChange={focus.onContentSizeChange}
      onSubmitEditing={() => actions.finishEditing(id)}
      onBlur={focus.onBlur}
      // Multiline so long titles wrap. "blurAndSubmit": Enter/Done saves and
      // closes the keyboard, and never inserts a newline.
      multiline
      submitBehavior="blurAndSubmit"
      returnKeyType="done"
      maxLength={TITLE_MAX}
      // Themed native caret (PLAN §2: reliable with selection, autocorrect and IME).
      cursorColor={colors.accent}
      selectionColor={colors.accent}
      selectionHandleColor={colors.accent}
      autoCorrect
      autoCapitalize="sentences"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.input, [titleStyles[variant], variant === 'group' && styles.group]]}
      accessibilityLabel="Task title"
      accessibilityHint="Done saves. Backspace on an empty title deletes the task."
    />
  );
}

const styles = StyleSheet.create({
  // No padding or margins: the editor must line up exactly with the Text it replaces.
  // Main-task (top-level) titles are drawn bright, as in the list.
  group: { color: colors.textBright },
  input: { flex: 1, color: colors.text, padding: 0, margin: 0, textAlignVertical: 'top', ...platformText },
});
