/**
 * components/common/CrashScreen.tsx: what the user sees if a screen crashes
 * (exported as the root ErrorBoundary in app/_layout.tsx).
 *
 *   > SOMETHING WENT WRONG
 *   Your tasks are safe: they're saved separately from the screen.
 *   [ TRY AGAIN ]  [ COPY ERROR DETAILS ]
 *
 * Layer: UI. Deliberately self-contained: it may render when the app's
 * providers (store, safe area) are what failed, so it uses none of them.
 * The app has no network access, so nothing is reported automatically;
 * COPY ERROR DETAILS lets a beta tester paste the details into a message.
 */
import * as Clipboard from 'expo-clipboard';
import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { appBuild, appVersion } from '@/services/appInfo';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** The text copied for a bug report: version, platform and the error with its stack. */
export function errorReport(error: Error): string {
  return [
    `quest_log v${appVersion()} (build ${appBuild()})`,
    `${Platform.OS} ${String(Platform.Version)}`,
    `${error.name}: ${error.message}`,
    error.stack ?? '',
  ].join('\n');
}

/** The crash screen (see file header). */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={[styles.screen, { paddingTop: (StatusBar.currentHeight ?? 0) + space.xl }]}>
      <Text style={[type.display, styles.accent]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} SOMETHING WENT WRONG`}
      </Text>
      <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Your tasks are safe: they&apos;re saved separately from the screen. Try again, and if it keeps happening, copy the details and send
        them to the developer.
      </Text>
      <View style={styles.buttons}>
        <Button label="TRY AGAIN" onPress={() => void retry()} />
        <Button
          label={copied ? 'COPIED' : 'COPY ERROR DETAILS'}
          onPress={() => {
            void Clipboard.setStringAsync(errorReport(error)).then(() => setCopied(true));
          }}
        />
      </View>
      <ScrollView style={styles.details}>
        <Text style={[type.meta, styles.dim]} selectable maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${error.name}: ${error.message}`}
        </Text>
      </ScrollView>
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label.toLowerCase()}
    >
      <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`[ ${label} ]`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg, gap: space.lg },
  buttons: { gap: space.md },
  button: {
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.accent,
    borderRadius: shape.radius,
  },
  pressed: { backgroundColor: colors.surface },
  details: { flexGrow: 0, maxHeight: 200 },
  accent: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
