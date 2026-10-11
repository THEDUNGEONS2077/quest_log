/**
 * components/dev/KeyboardLogPanel.tsx: the keyboard log on the developer
 * screen (components/common/keyboardLog.ts).
 *
 * Layer: UI (developer tools). For the "> new quest bar stuck mid-screen"
 * bug, which only happens now and then on the phone: right after it shows
 * up, long-press the title to open this screen and read or copy what each
 * keyboard tracker reported, and what the bar did about it. In memory only;
 * COPY puts it on the clipboard, nothing is sent anywhere.
 */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clearKeyboardLog, keyboardLogText } from '@/components/common/keyboardLog';
import { colors, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export function KeyboardLogPanel() {
  // Read when the screen opens; REFRESH reads it again.
  const [text, setText] = useState(keyboardLogText);
  return (
    <View>
      <View style={styles.actions}>
        {[
          { label: 'REFRESH', run: () => setText(keyboardLogText()) },
          { label: 'COPY', run: () => void Clipboard.setStringAsync(text) },
          {
            label: 'CLEAR',
            run: () => {
              clearKeyboardLog();
              setText('');
            },
          },
        ].map((b) => (
          <Pressable
            key={b.label}
            onPress={b.run}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={`${b.label} keyboard log`}
          >
            <Text style={[type.meta, styles.buttonText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[type.meta, styles.log]} selectable maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {text || '(empty: nothing reported yet)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  button: {
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  buttonText: { color: colors.accent, ...platformText },
  log: { color: colors.textDim, ...platformText },
});
