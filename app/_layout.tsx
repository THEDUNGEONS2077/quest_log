/**
 * app/_layout.tsx: root layout, which wraps every screen.
 *
 * Layer: UI (Expo Router). In Phase 1 it only sets up the app shell:
 *   - the gesture handler root (required by react-native-gesture-handler),
 *   - safe-area insets,
 *   - the light status bar on a black background,
 *   - a header-less Stack, since each screen draws its own terminal header.
 *
 * Planned (ARCHITECTURE.md "Startup sequence"): Phase 3 adds synchronous
 * hydration + migrations + ops drain here before the first render, and
 * Phase 11 adds the boot sequence overlay.
 *
 * Fonts need no loading step here: they're embedded at build time by the
 * expo-font config plugin (app.config.ts).
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* Light icons on black. The app draws edge-to-edge, so the Android
            navigation bar shows the black root background beneath it. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: styles.root,
            // A black background during transitions prevents white flashes.
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
