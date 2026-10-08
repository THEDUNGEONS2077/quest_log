/**
 * app/_layout.tsx: root layout, which wraps every screen.
 *
 * Layer: UI (Expo Router). Sets up the app shell:
 *   - the store: importing '@/store' hydrates it synchronously from MMKV,
 *     so the first render already has the user's tasks (ARCHITECTURE.md §4.4),
 *   - the gesture handler root (required by react-native-gesture-handler),
 *   - the keyboard controller (quick-add bar and editor stay above the keyboard),
 *   - safe-area insets,
 *   - the light status bar on a black background,
 *   - a header-less Stack, since each screen draws its own terminal header,
 *   - reminders: queued notification actions are drained and the OS
 *     schedule reconciled at start, on foreground and after changes
 *     (services/reminderLifecycle.ts). The notification background task is
 *     defined by importing services/notificationTask first, at load time.
 *
 * Planned: the boot sequence overlay (Phase 11).
 *
 * Fonts need no loading step here: they're embedded at build time by the
 * expo-font config plugin (app.config.ts).
 */
// Must load before anything else: defines the background task that handles
// DONE/SNOOZE taps when Android starts JS without any UI.
import '@/services/notificationTask';

import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setHapticsEnabled } from '@/services/haptics';
import { startReminders } from '@/services/reminderLifecycle';
import { appBundle, kv } from '@/store';
import { StoreProvider } from '@/store/react';
import { colors } from '@/theme';

export default function RootLayout() {
  // Keep the haptics service in step with the "Haptics" setting.
  useEffect(() => {
    const { store } = appBundle;
    setHapticsEnabled(store.getState().settings.haptics);
    return store.subscribe((s) => s.settings.haptics, setHapticsEnabled);
  }, []);

  // Reminders: drain queued notification actions, reconcile the schedule, and
  // open a task when its notification is tapped.
  useEffect(
    () =>
      startReminders(appBundle.store, kv, (taskId) => {
        appBundle.store.getState().revealTask(taskId);
        router.navigate('/');
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <StoreProvider value={appBundle}>
        <KeyboardProvider>
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
        </KeyboardProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
